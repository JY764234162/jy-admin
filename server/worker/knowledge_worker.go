package worker

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"time"

	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/utils/upload"
)

// ParseJob 解析任务
type ParseJob struct {
	DocID    string
	CosKey   string
	Filename string
	UserID   uint
}

var jobQueue chan ParseJob

// StartKnowledgeWorker 启动知识库异步解析 Worker
func StartKnowledgeWorker() {
	// 启动恢复：将之前 pending/parsing 的标记为 failed
	if global.JY_DB != nil {
		result := global.JY_DB.Model(&business.AIKnowledgeFile{}).
			Where("status IN ?", []string{"pending", "parsing"}).
			Updates(map[string]interface{}{"status": "failed", "error_msg": "服务重启，请手动重试"})
		if result.Error != nil {
			log.Printf("启动恢复失败: %v\n", result.Error)
		} else if result.RowsAffected > 0 {
			log.Printf("启动恢复完成，共标记 %d 个文件为失败\n", result.RowsAffected)
		}
	}

	// 创建任务队列（缓冲区 50）
	jobQueue = make(chan ParseJob, 50)

	// 启动单个 worker goroutine（限制并发为 1）
	go func() {
		log.Println("知识库解析 Worker 已启动")
		for job := range jobQueue {
			processParseJob(job)
		}
	}()
}

// EnqueueParseJob 将解析任务加入队列
func EnqueueParseJob(job ParseJob) {
	if jobQueue == nil {
		log.Println("警告: jobQueue 未初始化，尝试重新启动 Worker")
		StartKnowledgeWorker()
	}
	jobQueue <- job
}

// processParseJob 处理单个解析任务
func processParseJob(job ParseJob) {
	log.Printf("开始解析文档: %s (doc_id=%s)\n", job.Filename, job.DocID)

	// 1. 更新状态为 parsing
	if err := global.JY_DB.Model(&business.AIKnowledgeFile{}).
		Where("doc_id = ?", job.DocID).
		Update("status", "parsing").Error; err != nil {
		log.Printf("更新 parsing 状态失败: %v\n", err)
	}

	// 2. 从 COS 下载文件
	cosUploader, ok := global.JY_OSS.(*upload.TencentCOS)
	if !ok {
		markFailed(job.DocID, "COS 未初始化")
		return
	}

	reader, err := cosUploader.DownloadFileByKey(job.CosKey)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("下载文件失败: %v", err))
		return
	}
	defer reader.Close()

	// 读取到内存（ai-server 需要 multipart 上传）
	fileBytes, err := io.ReadAll(reader)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("读取文件失败: %v", err))
		return
	}

	// 3. 调用 ai-server 解析
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://ai-server:8000"
	}

	parseBody := &bytes.Buffer{}
	writer := multipart.NewWriter(parseBody)
	part, err := writer.CreateFormFile("file", job.Filename)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("创建解析请求失败: %v", err))
		return
	}
	if _, err := part.Write(fileBytes); err != nil {
		markFailed(job.DocID, fmt.Sprintf("写入文件内容失败: %v", err))
		return
	}
	if err := writer.WriteField("doc_id", job.DocID); err != nil {
		markFailed(job.DocID, fmt.Sprintf("写入 doc_id 失败: %v", err))
		return
	}
	if err := writer.WriteField("user_id", fmt.Sprintf("%d", job.UserID)); err != nil {
		markFailed(job.DocID, fmt.Sprintf("写入 user_id 失败: %v", err))
		return
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/parse", parseBody)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("创建解析请求失败: %v", err))
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("调用 ai-server 解析失败: %v", err))
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		markFailed(job.DocID, fmt.Sprintf("读取解析响应失败: %v", err))
		return
	}

	if resp.StatusCode != http.StatusOK {
		markFailed(job.DocID, fmt.Sprintf("ai-server 解析失败: %s", string(respBody)))
		return
	}

	var parseResult struct {
		DocID    string `json:"doc_id"`
		Filename string `json:"filename"`
		Chunks   int    `json:"chunks"`
	}
	if err := json.Unmarshal(respBody, &parseResult); err != nil {
		markFailed(job.DocID, fmt.Sprintf("解析 ai-server 响应失败: %v", err))
		return
	}

	// 4. 更新状态为 indexed
	if err := global.JY_DB.Model(&business.AIKnowledgeFile{}).
		Where("doc_id = ?", job.DocID).
		Updates(map[string]interface{}{
			"status":      "indexed",
			"chunk_count": parseResult.Chunks,
			"error_msg":   "",
		}).Error; err != nil {
		log.Printf("更新 indexed 状态失败: %v\n", err)
		return
	}

	log.Printf("文档解析完成: %s (doc_id=%s, chunks=%d)\n", job.Filename, job.DocID, parseResult.Chunks)
}

// markFailed 标记任务失败
func markFailed(docID string, errMsg string) {
	log.Printf("文档解析失败: doc_id=%s, err=%s\n", docID, errMsg)
	if err := global.JY_DB.Model(&business.AIKnowledgeFile{}).
		Where("doc_id = ?", docID).
		Updates(map[string]interface{}{
			"status":    "failed",
			"error_msg": errMsg,
		}).Error; err != nil {
		log.Printf("更新 failed 状态失败: %v\n", err)
	}
}

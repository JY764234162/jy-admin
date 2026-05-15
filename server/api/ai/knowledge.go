package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
	"jiangyi.com/utils/upload"
	"jiangyi.com/worker"
)

// GetKnowledgeList 获取知识库文档列表（从数据库查询）
// @Summary      获取知识库文档列表
// @Description  查询当前用户的知识库文档列表（含COS地址）
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Success      200  {object}  common.Response{data=object{documents=[]object},msg=string}
// @Router       /ai/knowledge/list [get]
func (a *Api) GetKnowledgeList(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	keyword := c.Query("keyword")

	var files []business.AIKnowledgeFile
	db := global.JY_DB.Where("user_id = ?", userID)
	if keyword != "" {
		db = db.Where("filename LIKE ?", "%"+keyword+"%")
	}
	if err := db.Order("created_at DESC").Find(&files).Error; err != nil {
		common.FailWithMsg(c, "获取知识库列表失败")
		return
	}

	documents := make([]gin.H, 0, len(files))
	for _, f := range files {
		documents = append(documents, gin.H{
			"doc_id":      f.DocID,
			"source":      f.Filename,
			"chunk_count": f.ChunkCount,
			"cos_url":     f.CosURL,
			"file_type":   f.FileType,
			"status":      f.Status,
			"error_msg":   f.ErrorMsg,
			"created_at":  f.CreatedAt,
		})
	}

	common.OkWithData(c, gin.H{"documents": documents})
}

// UploadKnowledge 上传文档到知识库（COS + ai-server 解析）
// @Summary      上传知识库文档
// @Description  上传文档到COS，并调用ai-server进行解析和向量化
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "文档文件"
// @Success      200   {object}  common.Response{data=object{knowledge_id=string,filename=string,chunks=int,cos_url=string},msg=string}
// @Router       /ai/knowledge/upload [post]
func (a *Api) UploadKnowledge(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		common.FailWithMsg(c, "获取文件失败")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	supported := map[string]bool{
		".pdf": true, ".txt": true, ".md": true,
		".docx": true, ".xlsx": true, ".xls": true, ".csv": true,
	}
	if !supported[ext] {
		common.FailWithMsg(c, fmt.Sprintf("不支持的文件格式: %s", ext))
		return
	}

	// 1. 生成 doc_id
	docID := uuid.New().String()[:12]
	objectKey := fmt.Sprintf("ai-knowledge/%s_%s", docID, header.Filename)

	// 2. 上传到 COS
	oss, ok := global.JY_OSS.(upload.OSS)
	if !ok {
		common.FailWithMsg(c, "OSS未初始化")
		return
	}

	// 使用 UploadFileWithKey（需要类型断言到具体类型）
	cosUploader, ok := oss.(*upload.TencentCOS)
	var cosURL string
	if ok {
		cosURL, _, err = cosUploader.UploadFileWithKey(objectKey, header)
	} else {
		// fallback: 使用普通上传
		cosURL, _, err = oss.UploadFile(header)
	}
	if err != nil {
		common.FailWithMsg(c, fmt.Sprintf("上传文件到COS失败: %v", err))
		return
	}

	// 3. 保存元数据到数据库（状态为 pending）
	knowledgeFile := business.AIKnowledgeFile{
		DocID:      docID,
		Filename:   header.Filename,
		CosURL:     cosURL,
		CosKey:     objectKey,
		ChunkCount: 0,
		UserID:     userID,
		FileType:   ext,
		Status:     "pending",
	}
	if err := global.JY_DB.Create(&knowledgeFile).Error; err != nil {
		common.FailWithMsg(c, "保存知识库文件记录失败")
		return
	}

	// 4. 入队异步解析任务
	worker.EnqueueParseJob(worker.ParseJob{
		DocID:    docID,
		CosKey:   objectKey,
		Filename: header.Filename,
		UserID:   userID,
	})

	common.OkWithData(c, gin.H{
		"knowledge_id": docID,
		"filename":     header.Filename,
		"status":       "pending",
		"cos_url":      cosURL,
	})
}

// DeleteKnowledge 删除知识库文档（COS + 向量 + DB）
// @Summary      删除知识库文档
// @Description  删除COS文件、向量数据库记录和DB记录
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        docId  path      string  true  "文档ID"
// @Success      200    {object}  common.Response{data=object{message=string},msg=string}
// @Router       /ai/knowledge/{docId} [delete]
func (a *Api) DeleteKnowledge(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	docID := c.Param("docId")
	if docID == "" {
		common.FailWithMsg(c, "文档ID不能为空")
		return
	}

	// 查询记录
	var file business.AIKnowledgeFile
	if err := global.JY_DB.Where("doc_id = ? AND user_id = ?", docID, userID).First(&file).Error; err != nil {
		common.FailWithMsg(c, "文档不存在或无权限")
		return
	}

	// 1. 删除 COS 文件
	if file.CosKey != "" {
		if oss, ok := global.JY_OSS.(upload.OSS); ok {
			cosUploader, isCos := oss.(*upload.TencentCOS)
			if isCos {
				_ = cosUploader.DeleteFileByKey(file.CosKey)
			}
		}
	}

	// 2. 删除 ai-server 向量（带上 user_id，确保只删除当前用户的向量）
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://ai-server:8000"
	}
	req, _ := http.NewRequest(http.MethodDelete, aiServerURL+"/api/knowledge/"+docID+"?user_id="+fmt.Sprintf("%d", userID), nil)
	client := &http.Client{Timeout: 10 * time.Second}
	client.Do(req) // 忽略错误，即使向量删除失败也继续

	// 3. 删除 DB 记录
	global.JY_DB.Where("doc_id = ?", docID).Delete(&business.AIKnowledgeFile{})

	common.OkWithMsg(c, fmt.Sprintf("文档 %s 已删除", docID))
}

// QueryKnowledge 知识库问答（SSE 流式，代理到 ai-server）
// @Summary      知识库问答（流式）
// @Description  向 ai-server 知识库提问，SSE 流式返回
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{question=string,top_k=int,structured=bool}  true  "问题及参数"
// @Success      200   {string}  text/event-stream  "流式返回"
// @Router       /ai/knowledge/query [post]
func (a *Api) QueryKnowledge(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	var req struct {
		Question   string `json:"question" binding:"required"`
		TopK       int    `json:"top_k"`
		Structured bool   `json:"structured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}
	if req.TopK == 0 {
		req.TopK = 3
	}

	payload := map[string]interface{}{
		"question":   req.Question,
		"top_k":      req.TopK,
		"structured": req.Structured,
		"user_id":    fmt.Sprintf("%d", userID),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		common.FailWithMsg(c, "序列化失败")
		return
	}

	// 如果请求结构化输出（非流式），直接透传 JSON
	if req.Structured {
		resp, err := http.Post(aiServerURL+"/api/knowledge/query", "application/json", bytes.NewReader(body))
		if err != nil {
			common.FailWithMsg(c, "查询失败")
			return
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			common.FailWithMsg(c, "读取响应失败")
			return
		}

		if resp.StatusCode != http.StatusOK {
			common.FailWithMsg(c, fmt.Sprintf("ai-server 返回状态: %d, %s", resp.StatusCode, string(respBody)))
			return
		}

		c.Data(http.StatusOK, "application/json", respBody)
		return
	}

	// SSE 流式透传
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Transfer-Encoding", "chunked")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		common.FailWithMsg(c, "流式响应不支持")
		return
	}

	httpReq, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/query", bytes.NewReader(body))
	if err != nil {
		common.FailWithMsg(c, "创建请求失败")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"error":"查询失败","done":true}`)
		flusher.Flush()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(c.Writer, "data: %s\n\n", fmt.Sprintf(`{"error":"ai-server 返回状态: %d","done":true}`, resp.StatusCode))
		flusher.Flush()
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		fmt.Fprintf(c.Writer, "%s\n", line)
		flusher.Flush()
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", fmt.Sprintf(`{"error":"%s","done":true}`, err.Error()))
		flusher.Flush()
	}
}

// UploadKnowledgeStream 流式上传文档（带实时进度反馈）
// @Summary      上传知识库文档（异步流式）
// @Description  转发到 ai-server /api/knowledge/upload-stream，返回 task_id 用于 SSE 进度监听
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "文档文件"
// @Success      200   {object}  common.Response{data=object{task_id=string,filename=string,doc_id=string},msg=string}
// @Router       /ai/knowledge/upload-stream [post]
func (a *Api) UploadKnowledgeStream(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		common.FailWithMsg(c, "获取文件失败")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	supported := map[string]bool{
		".pdf": true, ".txt": true, ".md": true,
		".docx": true, ".xlsx": true, ".xls": true, ".csv": true,
	}
	if !supported[ext] {
		common.FailWithMsg(c, fmt.Sprintf("不支持的文件格式: %s", ext))
		return
	}

	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	// 构造 multipart 转发给 ai-server
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", header.Filename)
	if err != nil {
		common.FailWithMsg(c, "构建上传请求失败")
		return
	}
	if _, err := io.Copy(fw, file); err != nil {
		common.FailWithMsg(c, "读取文件失败")
		return
	}
	_ = mw.WriteField("user_id", fmt.Sprintf("%d", userID))
	mw.Close()

	httpReq, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/upload-stream", &buf)
	if err != nil {
		common.FailWithMsg(c, "创建请求失败")
		return
	}
	httpReq.Header.Set("Content-Type", mw.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		common.FailWithMsg(c, fmt.Sprintf("转发到 ai-server 失败: %v", err))
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		common.FailWithMsg(c, "读取 ai-server 响应失败")
		return
	}
	if resp.StatusCode != http.StatusOK {
		common.FailWithMsg(c, fmt.Sprintf("ai-server 返回状态: %d, %s", resp.StatusCode, string(respBody)))
		return
	}

	var aiResp struct {
		TaskID   string `json:"task_id"`
		Filename string `json:"filename"`
	}
	if err := json.Unmarshal(respBody, &aiResp); err != nil {
		common.FailWithMsg(c, "解析 ai-server 响应失败")
		return
	}

	common.OkWithData(c, gin.H{
		"task_id":  aiResp.TaskID,
		"filename": aiResp.Filename,
		"user_id":  fmt.Sprintf("%d", userID),
	})
}

// KnowledgeProgress SSE 流式推送文档解析进度
// @Summary      获取文档解析进度（SSE）
// @Description  透传 ai-server /api/knowledge/progress/{task_id} 的 SSE 进度流
// @Security     ApiKeyAuth
// @Tags         AI
// @Produce      text/event-stream
// @Param        taskId  path      string  true  "任务ID"
// @Success      200     {string}  text/event-stream  "流式返回"
// @Router       /ai/knowledge/progress/{taskId} [get]
func (a *Api) KnowledgeProgress(c *gin.Context) {
	taskID := c.Param("taskId")
	if taskID == "" {
		common.FailWithMsg(c, "任务ID不能为空")
		return
	}

	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		common.FailWithMsg(c, "流式响应不支持")
		return
	}

	httpReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, aiServerURL+"/api/knowledge/progress/"+taskID, nil)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"stage":"failed","message":"创建请求失败","error":"new request failed"}`)
		flusher.Flush()
		return
	}

	// 不限制读取总时间，仅设置连接握手超时
	client := newSSEClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", fmt.Sprintf(`{"stage":"failed","message":"连接 ai-server 失败","error":"%s"}`, err.Error()))
		flusher.Flush()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(c.Writer, "data: %s\n\n", fmt.Sprintf(`{"stage":"failed","message":"ai-server 返回状态: %d","error":"bad status"}`, resp.StatusCode))
		flusher.Flush()
		return
	}

	// 逐 chunk 透传
	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			if _, werr := fmt.Fprint(c.Writer, line); werr != nil {
				return
			}
			// SSE 事件以空行分隔，遇到空行就 flush
			if line == "\n" || line == "\r\n" {
				flusher.Flush()
			}
		}
		if err != nil {
			if err == io.EOF {
				flusher.Flush()
			}
			return
		}
	}
}

// RetryKnowledge 重试失败的文档解析
// @Summary      重试解析失败的文档
// @Description  将状态为 failed 的文档重新入队解析
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        docId  path      string  true  "文档ID"
// @Success      200    {object}  common.Response{data=object{message=string},msg=string}
// @Router       /ai/knowledge/{docId}/retry [post]
func (a *Api) RetryKnowledge(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	userID := claims.(*utils.CustomClaims).ID

	docID := c.Param("docId")
	if docID == "" {
		common.FailWithMsg(c, "文档ID不能为空")
		return
	}

	// 查询记录
	var file business.AIKnowledgeFile
	if err := global.JY_DB.Where("doc_id = ? AND user_id = ?", docID, userID).First(&file).Error; err != nil {
		common.FailWithMsg(c, "文档不存在或无权限")
		return
	}

	if file.Status != "failed" {
		common.FailWithMsg(c, fmt.Sprintf("当前状态为 %s，仅失败的文档可以重试", file.Status))
		return
	}

	// 更新状态为 pending 并入队
	if err := global.JY_DB.Model(&business.AIKnowledgeFile{}).
		Where("doc_id = ?", docID).
		Updates(map[string]interface{}{
			"status":    "pending",
			"error_msg": "",
		}).Error; err != nil {
		common.FailWithMsg(c, "重置状态失败")
		return
	}

	worker.EnqueueParseJob(worker.ParseJob{
		DocID:    docID,
		CosKey:   file.CosKey,
		Filename: file.Filename,
		UserID:   userID,
	})

	common.OkWithMsg(c, fmt.Sprintf("文档 %s 已重新入队", docID))
}

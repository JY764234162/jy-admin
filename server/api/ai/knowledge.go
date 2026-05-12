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

	var files []business.AIKnowledgeFile
	if err := global.JY_DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&files).Error; err != nil {
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

	// 3. 调用 ai-server 解析（multipart 转发）
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://ai-server:8000"
	}

	parseBody := &bytes.Buffer{}
	writer := multipart.NewWriter(parseBody)
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		common.FailWithMsg(c, "创建解析请求失败")
		return
	}
	file.Seek(0, io.SeekStart)
	if _, err := io.Copy(part, file); err != nil {
		common.FailWithMsg(c, "复制文件内容失败")
		return
	}
	// 传入 doc_id，让 ai-server 与后端共用同一 ID
	if err := writer.WriteField("doc_id", docID); err != nil {
		common.FailWithMsg(c, "写入解析参数失败")
		return
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/parse", parseBody)
	if err != nil {
		common.FailWithMsg(c, "创建解析请求失败")
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		common.FailWithMsg(c, fmt.Sprintf("调用ai-server解析失败: %v", err))
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		common.FailWithMsg(c, "读取解析响应失败")
		return
	}

	if resp.StatusCode != http.StatusOK {
		common.FailWithMsg(c, fmt.Sprintf("ai-server解析失败: %s", string(respBody)))
		return
	}

	var parseResult struct {
		DocID    string `json:"doc_id"`
		Filename string `json:"filename"`
		Chunks   int    `json:"chunks"`
	}
	if err := json.Unmarshal(respBody, &parseResult); err != nil {
		common.FailWithMsg(c, "解析ai-server响应失败")
		return
	}

	// 4. 保存元数据到数据库
	knowledgeFile := business.AIKnowledgeFile{
		DocID:      docID,
		Filename:   header.Filename,
		CosURL:     cosURL,
		CosKey:     objectKey,
		ChunkCount: parseResult.Chunks,
		UserID:     userID,
		FileType:   ext,
	}
	if err := global.JY_DB.Create(&knowledgeFile).Error; err != nil {
		common.FailWithMsg(c, "保存知识库文件记录失败")
		return
	}

	common.OkWithData(c, gin.H{
		"knowledge_id": docID,
		"filename":     header.Filename,
		"chunks":       parseResult.Chunks,
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

	// 2. 删除 ai-server 向量
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://ai-server:8000"
	}
	req, _ := http.NewRequest(http.MethodDelete, aiServerURL+"/api/knowledge/"+docID, nil)
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

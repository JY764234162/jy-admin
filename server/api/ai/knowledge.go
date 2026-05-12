package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
)

// GetKnowledgeList 获取知识库文档列表（代理到 ai-server）
// @Summary      获取知识库文档列表
// @Description  从 ai-server 获取知识库文档列表
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Success      200  {object}  common.Response{data=object{documents=[]object},msg=string}
// @Router       /ai/knowledge/list [get]
func (a *Api) GetKnowledgeList(c *gin.Context) {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	resp, err := http.Get(aiServerURL + "/api/knowledge/list")
	if err != nil {
		common.FailWithMsg(c, "获取知识库列表失败")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		common.FailWithMsg(c, fmt.Sprintf("ai-server 返回状态: %d", resp.StatusCode))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		common.FailWithMsg(c, "读取响应失败")
		return
	}

	c.Data(http.StatusOK, "application/json", body)
}

// UploadKnowledge 上传文档到知识库（代理到 ai-server）
// @Summary      上传知识库文档
// @Description  将文档上传到 ai-server 知识库
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "文档文件"
// @Success      200   {object}  common.Response{data=object{knowledge_id=string,filename=string,chunks=int},msg=string}
// @Router       /ai/knowledge/upload [post]
func (a *Api) UploadKnowledge(c *gin.Context) {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		common.FailWithMsg(c, "获取文件失败")
		return
	}
	defer file.Close()

	// 构建 multipart 请求体
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		common.FailWithMsg(c, "创建表单失败")
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		common.FailWithMsg(c, "复制文件失败")
		return
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/upload", &body)
	if err != nil {
		common.FailWithMsg(c, "创建请求失败")
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		common.FailWithMsg(c, "上传失败")
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
}

// DeleteKnowledge 删除知识库文档（代理到 ai-server）
// @Summary      删除知识库文档
// @Description  从 ai-server 知识库删除指定文档
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        docId  path      string  true  "文档ID"
// @Success      200    {object}  common.Response{data=object{message=string},msg=string}
// @Router       /ai/knowledge/{docId} [delete]
func (a *Api) DeleteKnowledge(c *gin.Context) {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	docId := c.Param("docId")
	if docId == "" {
		common.FailWithMsg(c, "文档ID不能为空")
		return
	}

	req, err := http.NewRequest(http.MethodDelete, aiServerURL+"/api/knowledge/"+docId, nil)
	if err != nil {
		common.FailWithMsg(c, "创建请求失败")
		return
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		common.FailWithMsg(c, "删除失败")
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

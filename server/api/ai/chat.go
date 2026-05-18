package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// ChatMessage 发送消息（流式返回）
// @Summary      发送AI消息
// @Description  向AI发送消息并流式返回响应
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{conversationId=int,content=string,mode=string}  true  "会话ID、消息内容、模式"
// @Success      200   {string}  text/event-stream  "流式返回"
// @Router       /ai/chat [post]
func (a *Api) ChatMessage(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var req struct {
		ConversationID uint     `json:"conversationId" binding:"required"`
		Content        string   `json:"content" binding:"required"`
		Mode           string   `json:"mode"`
		DeepThinking   bool     `json:"deepThinking"`
		DocIDs         []string `json:"doc_ids"`
		Attachments    string   `json:"attachments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}
	if req.Mode == "" {
		req.Mode = "aiserver_chat"
	}

	var conversation business.AIConversation
	if err := global.JY_DB.Where("id = ? AND user_id = ?", req.ConversationID, userID).First(&conversation).Error; err != nil {
		common.FailWithMsg(c, "会话不存在或无权限")
		return
	}

	// 保存用户消息
	userMessage := business.AIMessage{
		ConversationID: req.ConversationID,
		Role:           "user",
		Content:        req.Content,
		UserID:         userID,
	}
	if req.Attachments != "" {
		userMessage.Attachments = req.Attachments
	}
	if err := global.JY_DB.Create(&userMessage).Error; err != nil {
		common.FailWithMsg(c, "保存消息失败")
		return
	}

	// 插入 AI 占位消息
	assistantMessage := business.AIMessage{
		ConversationID: req.ConversationID,
		Role:           "assistant",
		Content:        "",
		UserID:         userID,
		Status:         "loading",
	}
	if err := global.JY_DB.Create(&assistantMessage).Error; err != nil {
		common.FailWithMsg(c, "保存助手消息失败")
		return
	}

	// 创建后台生成任务
	task := startGenerationTask(req.ConversationID, assistantMessage.ID)

	// 启动后台 goroutine 读取 ai-server 流
	go a.runBackgroundGeneration(task, req.ConversationID, assistantMessage.ID, req.Content, req.Mode, req.DeepThinking, req.DocIDs, conversation, userID)

	// 设置 SSE 并从头推送
	a.serveSSE(c, task, 0)
}

// ResumeChat 重连恢复流式输出
// @Summary      重连恢复流式输出
// @Description  前端刷新后重连，先返回已累积内容再继续推送新 chunk
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{conversationId=int}  true  "会话ID"
// @Success      200   {string}  text/event-stream  "流式返回"
// @Router       /ai/chat/resume [post]
func (a *Api) ResumeChat(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var req struct {
		ConversationID uint `json:"conversationId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}

	// 验证会话
	var conversation business.AIConversation
	if err := global.JY_DB.Where("id = ? AND user_id = ?", req.ConversationID, userID).First(&conversation).Error; err != nil {
		common.FailWithMsg(c, "会话不存在或无权限")
		return
	}

	// 查找最后一条 loading 的 AI 消息
	var lastLoading business.AIMessage
	if err := global.JY_DB.Where("conversation_id = ? AND role = ? AND status = ?", req.ConversationID, "assistant", "loading").
		Order("created_at DESC").First(&lastLoading).Error; err != nil {
		common.FailWithMsg(c, "没有找到可恢复的 AI 消息")
		return
	}

	// 尝试获取正在进行的生成任务：重连时第一帧直接发出当前完整缓存，后续 chunk 增量转发
	// 不再依赖 DB 中可能滞后的 lastLoading.Content 作为起点，避免中间 chunk 丢失
	if task, ok := getGenerationTask(req.ConversationID); ok {
		a.serveSSE(c, task, 0)
		return
	}

	// 任务已完成，直接返回数据库中的内容
	a.serveCompletedMessage(c, lastLoading)
}

// StreamChunk 代表 ai-server 返回的单个流式块（含 content / process / status）
type StreamChunk struct {
	Content string `json:"content"`
	Answer  string `json:"answer"`
	Process string `json:"process"` // JSON string，由 ai-server 的 process 字段序列化而来
	Status  string `json:"status"`
	Done    bool   `json:"done"`
	Error   string `json:"error"`
}

// runBackgroundGeneration 后台 goroutine：读取 ai-server 流，保存到 DB，通知等待者
//
// 设计要点：
//  1. streamCallback 只做"内存追加 + 广播"，从而不会阻塞 ai-server → Go 的 scanner 循环，
//     避免长回复时因 TCP 背压让上游 chunk 间隔越来越大。
//  2. DB 落库放到独立 goroutine，按时间窗口（dbSyncInterval）周期性写入。
//     finish 前停止该 goroutine，并由主流程做最终一次落库。
func (a *Api) runBackgroundGeneration(task *generationTask, conversationID, assistantMsgID uint, content, mode string, deepThinking bool, docIDs []string, conversation business.AIConversation, userID uint) {
	var streamErr error

	streamCallback := func(chunk StreamChunk) {
		if chunk.Answer != "" {
			task.append(chunk.Answer)
		} else if chunk.Content != "" {
			task.append(chunk.Content)
		}
		if chunk.Process != "" {
			task.appendProcess(chunk.Process)
		}
		if chunk.Status != "" {
			task.appendStatus(chunk.Status)
		}
	}

	// 启动独立的 DB 同步 goroutine，从热路径解耦
	dbSyncStop := make(chan struct{})
	dbSyncDone := make(chan struct{})
	go a.runDBSyncLoop(task, assistantMsgID, dbSyncStop, dbSyncDone)

	switch mode {
	case "aiserver_chat":
		var messages []business.AIMessage
		global.JY_DB.Where("conversation_id = ? AND id != ?", conversationID, assistantMsgID).Order("created_at ASC").Find(&messages)
		streamErr = a.callAIServerChatStream(messages, content, conversationID, deepThinking, streamCallback)
	case "aiserver_knowledge", "aiserver_attachment":
		streamErr = a.callAIServerKnowledgeStream(content, fmt.Sprintf("%d", userID), docIDs, mode, streamCallback)
	default:
		streamErr = fmt.Errorf("不支持的对话模式: %s", mode)
	}

	// 停止周期落库 goroutine，再由这里统一做最终落库
	close(dbSyncStop)
	<-dbSyncDone

	finalContent := task.getContent()
	if streamErr != nil {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Updates(map[string]interface{}{
			"status":  "error",
			"content": finalContent,
		})
	} else {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Updates(map[string]interface{}{
			"status":  "success",
			"content": finalContent,
		})
	}

	// 更新会话
	userLastMsg := content
	if len(userLastMsg) > 100 {
		userLastMsg = userLastMsg[:100]
	}
	global.JY_DB.Model(&conversation).Updates(map[string]interface{}{
		"last_msg":      userLastMsg,
		"message_count": conversation.MessageCount + 2,
	})

	task.finish(streamErr)
}

// runDBSyncLoop 周期性把 task 当前内容写入 DB（仅用于"Go 崩溃时的恢复"），
// 默认每 2s 一次，且只在内容相比上次落库有新增长度时才发起 UPDATE。
func (a *Api) runDBSyncLoop(task *generationTask, assistantMsgID uint, stop <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	lastSavedLen := 0
	flush := func() {
		curLen := task.contentLen()
		if curLen <= lastSavedLen {
			return
		}
		snapshot := task.getContent()
		if err := global.JY_DB.Model(&business.AIMessage{}).
			Where("id = ?", assistantMsgID).
			Update("content", snapshot).Error; err != nil {
			global.JY_LOG.Error("流式内容落库失败", zap.Error(err))
			return
		}
		lastSavedLen = curLen
	}

	for {
		select {
		case <-ticker.C:
			flush()
		case <-stop:
			return
		}
	}
}

// serveSSE 统一的 SSE 推送：从 startPos 开始读取 task 内容，有新内容就 push
func (a *Api) serveSSE(c *gin.Context, task *generationTask, startPos int) {
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

	pos := startPos
	lastProcess := ""
	lastStatus := ""
	for {
		// 读取当前最新内容（pos 与 task.content 都按字节计，避免 UTF-8 多字节字符被截断）
		task.mu.Lock()
		var newContent string
		if pos < len(task.content) {
			newContent = string(task.content[pos:])
		}
		process := string(task.process)
		status := task.status
		isDone := task.done
		err := task.err
		task.mu.Unlock()

		processChanged := process != "" && process != lastProcess
		statusChanged := status != "" && status != lastStatus

		// 发送新内容（如有 process/status 变化也一并带上）
		if newContent != "" || processChanged || statusChanged {
			payload := map[string]interface{}{"content": newContent, "done": false}
			if process != "" {
				payload["process"] = process
				lastProcess = process
			}
			if status != "" {
				payload["status"] = status
				lastStatus = status
			}
			writeSSE(c.Writer, flusher, payload)
			pos += len(newContent)
		}

		// 已完成
		if isDone {
			if err != nil {
				writeSSE(c.Writer, flusher, map[string]interface{}{"error": err.Error(), "done": true})
			} else {
				payload := map[string]interface{}{"content": "", "done": true}
				if process != "" {
					payload["process"] = process
				}
				if status != "" {
					payload["status"] = status
				}
				writeSSE(c.Writer, flusher, payload)
			}
			return
		}

		// 等待新内容或客户端断开
		if err := task.wait(c.Request.Context()); err != nil {
			return // 客户端断开
		}
	}
}

// serveCompletedMessage 任务已完成/不存在时，直接返回数据库中的内容
func (a *Api) serveCompletedMessage(c *gin.Context, msg business.AIMessage) {
	// 将残留的 loading 状态更新为 success
	global.JY_DB.Model(&business.AIMessage{}).Where("id = ? AND status = ?", msg.ID, "loading").
		Updates(map[string]interface{}{"status": "success"})

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

	if msg.Content != "" {
		writeSSE(c.Writer, flusher, map[string]interface{}{"content": msg.Content, "done": false})
	}

	writeSSE(c.Writer, flusher, map[string]interface{}{"content": "", "done": true})
}

// writeSSE 写一条 SSE event
func writeSSE(w gin.ResponseWriter, flusher http.Flusher, data map[string]interface{}) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(w, "data: %s\n\n", jsonData)
	flusher.Flush()
}

// StreamCallback 流式回调函数类型
type StreamCallback func(chunk StreamChunk)

// newSSEClient 创建适合 SSE 流式请求的 HTTP Client
// 连接/握手/等响应头有单独超时，但不限制读取响应体的总时间
func newSSEClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 10 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 120 * time.Second,
		},
	}
}

// ChatVision 多模态视觉对话（GLM-4V）
// @Summary      视觉对话（多模态）
// @Description  接收图片 base64 + 文字，调用 ai-server GLM-4V 模型，SSE 流式返回
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{message=string,image_base64=string}  true  "消息及图片 base64"
// @Success      200   {string}  text/event-stream  "流式返回"
// @Router       /ai/chat/vision [post]
func (a *Api) ChatVision(c *gin.Context) {
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var req struct {
		Message      string `json:"message" binding:"required"`
		ImageBase64  string `json:"image_base64" binding:"required"`
		ConversationID uint `json:"conversationId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}

	// 验证会话
	var conversation business.AIConversation
	if req.ConversationID > 0 {
		if err := global.JY_DB.Where("id = ? AND user_id = ?", req.ConversationID, userID).First(&conversation).Error; err != nil {
			common.FailWithMsg(c, "会话不存在或无权限")
			return
		}
	}

	// 保存用户消息
	userMessage := business.AIMessage{
		ConversationID: req.ConversationID,
		Role:           "user",
		Content:        req.Message,
		UserID:         userID,
	}
	if err := global.JY_DB.Create(&userMessage).Error; err != nil {
		common.FailWithMsg(c, "保存消息失败")
		return
	}

	// 插入 AI 占位消息
	assistantMessage := business.AIMessage{
		ConversationID: req.ConversationID,
		Role:           "assistant",
		Content:        "",
		UserID:         userID,
		Status:         "loading",
	}
	if err := global.JY_DB.Create(&assistantMessage).Error; err != nil {
		common.FailWithMsg(c, "保存助手消息失败")
		return
	}

	// 创建后台生成任务
	task := startGenerationTask(req.ConversationID, assistantMessage.ID)

	// 启动后台 goroutine 读取 ai-server vision 流
	go a.runBackgroundVision(task, req.ConversationID, assistantMessage.ID, req.Message, req.ImageBase64)

	// 设置 SSE 并从头推送
	a.serveSSE(c, task, 0)
}

// runBackgroundVision 后台 goroutine：读取 ai-server vision 流，保存到 DB
func (a *Api) runBackgroundVision(task *generationTask, conversationID, assistantMsgID uint, message, imageBase64 string) {
	streamCallback := func(chunk StreamChunk) {
		if chunk.Content != "" {
			task.append(chunk.Content)
		}
	}

	dbSyncStop := make(chan struct{})
	dbSyncDone := make(chan struct{})
	go a.runDBSyncLoop(task, assistantMsgID, dbSyncStop, dbSyncDone)

	streamErr := a.callAIServerVisionStream(message, imageBase64, streamCallback)

	close(dbSyncStop)
	<-dbSyncDone

	finalContent := task.getContent()
	if streamErr != nil {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Updates(map[string]interface{}{
			"status":  "error",
			"content": finalContent,
		})
	} else {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Updates(map[string]interface{}{
			"status":  "success",
			"content": finalContent,
		})
	}

	// 更新会话
	userLastMsg := message
	if len(userLastMsg) > 100 {
		userLastMsg = userLastMsg[:100]
	}
	global.JY_DB.Model(&business.AIConversation{}).Where("id = ?", conversationID).Updates(map[string]interface{}{
		"last_msg": userLastMsg,
	})

	task.finish(streamErr)
}

// callAIServerVisionStream 转发到 ai-server 视觉对话（SSE 透传）
func (a *Api) callAIServerVisionStream(message, imageBase64 string, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	payload := map[string]interface{}{
		"message":      message,
		"image_base64": imageBase64,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal ai-server vision payload error: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/chat/vision", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create ai-server vision request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := newSSEClient()
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("call ai-server vision error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ai-server vision status: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var parsed struct {
			Content string `json:"content"`
			Done    bool   `json:"done"`
			Error   string `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &parsed); err != nil {
			continue
		}
		if parsed.Error != "" {
			return fmt.Errorf("ai-server vision error: %s", parsed.Error)
		}
		if parsed.Done {
			break
		}

		callback(StreamChunk{Content: parsed.Content, Done: parsed.Done, Error: parsed.Error})
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ai-server vision stream error: %w", err)
	}
	return nil
}

// callAIServerChatStream 转发到 ai-server 基础对话（SSE 透传）
func (a *Api) callAIServerChatStream(messages []business.AIMessage, newContent string, conversationID uint, deepThinking bool, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	var history []map[string]string
	for _, m := range messages {
		role := "user"
		if m.Role == "assistant" {
			role = "assistant"
		}
		history = append(history, map[string]string{
			"role":    role,
			"content": m.Content,
		})
	}

	payload := map[string]interface{}{
		"message":      newContent,
		"messages":     history,
		"deep_thinking": deepThinking,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal ai-server payload error: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create ai-server request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := newSSEClient()
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("call ai-server error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ai-server status: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var parsed struct {
			Content string          `json:"content"`
			Answer  string          `json:"answer"`
			Status  string          `json:"status"`
			Process json.RawMessage `json:"process"`
			Done    bool            `json:"done"`
			Error   string          `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &parsed); err != nil {
			continue
		}
		if parsed.Error != "" {
			return fmt.Errorf("ai-server error: %s", parsed.Error)
		}
		if parsed.Done {
			break
		}

		chunk := StreamChunk{
			Content: parsed.Content,
			Answer:  parsed.Answer,
			Status:  parsed.Status,
			Done:    parsed.Done,
			Error:   parsed.Error,
		}
		if len(parsed.Process) > 0 {
			chunk.Process = string(parsed.Process)
		}
		callback(chunk)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ai-server stream error: %w", err)
	}
	return nil
}

// callAIServerKnowledgeStream 转发到 ai-server 知识库问答（SSE 透传）
func (a *Api) callAIServerKnowledgeStream(question, userID string, docIDs []string, mode string, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	// 避免 nil slice 被序列化为 null，导致 ai-server Pydantic 验证失败
	if docIDs == nil {
		docIDs = []string{}
	}

	payload := map[string]interface{}{
		"question":   question,
		"top_k":      3,
		"structured": false,
		"user_id":    userID,
		"doc_ids":    docIDs,
		"mode":       mode,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal ai-server payload error: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, aiServerURL+"/api/knowledge/query", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create ai-server request error: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := newSSEClient()
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("call ai-server error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ai-server status: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var parsed struct {
			Content string          `json:"content"`
			Answer  string          `json:"answer"`
			Status  string          `json:"status"`
			Process json.RawMessage `json:"process"`
			Done    bool            `json:"done"`
			Error   string          `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &parsed); err != nil {
			continue
		}
		if parsed.Error != "" {
			return fmt.Errorf("ai-server error: %s", parsed.Error)
		}
		if parsed.Done {
			break
		}

		chunk := StreamChunk{
			Content: parsed.Content,
			Answer:  parsed.Answer,
			Status:  parsed.Status,
			Done:    parsed.Done,
			Error:   parsed.Error,
		}
		if len(parsed.Process) > 0 {
			chunk.Process = string(parsed.Process)
		}
		callback(chunk)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ai-server stream error: %w", err)
	}
	return nil
}

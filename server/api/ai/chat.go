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
		ConversationID uint   `json:"conversationId" binding:"required"`
		Content        string `json:"content" binding:"required"`
		Mode           string `json:"mode"`
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
	go a.runBackgroundGeneration(task, req.ConversationID, assistantMessage.ID, req.Content, req.Mode, conversation)

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

	// 尝试获取正在进行的生成任务
	if task, ok := getGenerationTask(req.ConversationID); ok {
		a.serveSSE(c, task, len([]rune(lastLoading.Content)))
		return
	}

	// 任务已完成，直接返回数据库中的内容
	a.serveCompletedMessage(c, lastLoading)
}

// runBackgroundGeneration 后台 goroutine：读取 ai-server 流，保存到 DB，通知等待者
func (a *Api) runBackgroundGeneration(task *generationTask, conversationID, assistantMsgID uint, content, mode string, conversation business.AIConversation) {
	var assistantContent strings.Builder
	var streamErr error
	chunkCount := 0

	streamCallback := func(chunk string) {
		assistantContent.WriteString(chunk)
		task.append(chunk)

		// 每 5 个 chunk 写一次 DB，减少写放大
		chunkCount++
		if chunkCount%5 == 0 {
			if dbErr := global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Update("content", assistantContent.String()).Error; dbErr != nil {
				global.JY_LOG.Error("更新助手消息内容失败", zap.Error(dbErr))
			}
		}
	}

	switch mode {
	case "aiserver_chat":
		var messages []business.AIMessage
		global.JY_DB.Where("conversation_id = ? AND id != ?", conversationID, assistantMsgID).Order("created_at ASC").Find(&messages)
		streamErr = a.callAIServerChatStream(messages, content, conversationID, streamCallback)
	case "aiserver_knowledge":
		streamErr = a.callAIServerKnowledgeStream(content, streamCallback)
	default:
		streamErr = fmt.Errorf("不支持的对话模式: %s", mode)
	}

	if streamErr != nil {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Update("status", "error")
	} else {
		global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Updates(map[string]interface{}{
			"status":  "success",
			"content": assistantContent.String(),
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
	for {
		// 读取当前最新内容
		task.mu.Lock()
		newContent := task.content[pos:]
		isDone := task.done
		err := task.err
		task.mu.Unlock()

		// 发送新内容
		if newContent != "" {
			writeSSE(c.Writer, flusher, map[string]interface{}{"content": newContent, "done": false})
			pos += len([]rune(newContent))
		}

		// 已完成
		if isDone {
			if err != nil {
				writeSSE(c.Writer, flusher, map[string]interface{}{"error": err.Error(), "done": true})
			} else {
				writeSSE(c.Writer, flusher, map[string]interface{}{"content": "", "done": true})
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
type StreamCallback func(chunk string)

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

// callAIServerChatStream 转发到 ai-server 基础对话（SSE 透传）
func (a *Api) callAIServerChatStream(messages []business.AIMessage, newContent string, conversationID uint, callback StreamCallback) error {
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
		"message":  newContent,
		"messages": history,
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
			Content string `json:"content"`
			Done    bool   `json:"done"`
			Error   string `json:"error"`
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
		if parsed.Content != "" {
			callback(parsed.Content)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ai-server stream error: %w", err)
	}
	return nil
}

// callAIServerKnowledgeStream 转发到 ai-server 知识库问答（SSE 透传）
func (a *Api) callAIServerKnowledgeStream(question string, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
	}

	payload := map[string]interface{}{
		"question":   question,
		"top_k":      3,
		"structured": false,
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
			Content string `json:"content"`
			Done    bool   `json:"done"`
			Error   string `json:"error"`
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
		if parsed.Content != "" {
			callback(parsed.Content)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ai-server stream error: %w", err)
	}
	return nil
}

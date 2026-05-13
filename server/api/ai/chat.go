package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
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
// @Description  向AI发送消息并流式返回响应，支持 aiserver_chat / aiserver_knowledge 两种模式
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{conversationId=int,content=string,mode=string,resume=bool}  true  "会话ID、消息内容、模式、是否恢复"
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
		ConversationID uint   `json:"conversationId"`
		Content        string `json:"content"` // resume 模式下可以为空
		Mode           string `json:"mode"`   // aiserver_chat | aiserver_knowledge
		Resume         bool   `json:"resume"` // 是否为恢复模式（刷新后重连）
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}
	if req.Mode == "" {
		req.Mode = "aiserver_chat"
	}
	if !req.Resume && req.Content == "" {
		common.FailWithMsg(c, "消息内容不能为空")
		return
	}

	var conversation business.AIConversation
	if req.ConversationID == 0 {
		common.FailWithMsg(c, "会话ID不能为空")
		return
	}
	if err := global.JY_DB.Where("id = ? AND user_id = ?", req.ConversationID, userID).First(&conversation).Error; err != nil {
		common.FailWithMsg(c, "会话不存在或无权限")
		return
	}

	var assistantMsgID uint

	if req.Resume {
		// 恢复模式：复用当前会话最后一条 loading 的 AI 消息
		var lastLoading business.AIMessage
		if err := global.JY_DB.Where("conversation_id = ? AND role = ? AND status = ?", req.ConversationID, "assistant", "loading").
			Order("created_at DESC").First(&lastLoading).Error; err != nil {
			common.FailWithMsg(c, "没有找到可恢复的 AI 消息")
			return
		}
		assistantMsgID = lastLoading.ID

		// 先尝试获取正在进行的生成任务
		if task, ok := getGenerationTask(req.ConversationID); ok {
			a.serveResume(c, task)
			return
		}

		// 任务已完成，直接从数据库返回最终内容
		a.serveCompletedMessage(c, lastLoading)
		return
	}

	// 正常模式：保存用户消息并插入 AI 占位消息
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
	assistantMsgID = assistantMessage.ID

	// 创建后台生成任务
	task := startGenerationTask(req.ConversationID, assistantMsgID)

	// 主 goroutine 先注册观察者，再启动后台生成，确保不丢开头 chunk
	ch := make(chan string, 1000)
	task.addSubscriber(ch)

	// 启动后台 goroutine 读取 ai-server 流
	go a.runBackgroundGeneration(task, req.ConversationID, assistantMsgID, req.Content, req.Mode, conversation)

	// 设置 SSE 并推送
	a.serveStream(c, task, ch)
}

// runBackgroundGeneration 后台 goroutine：读取 ai-server 流，保存到 DB，通知观察者
func (a *Api) runBackgroundGeneration(task *generationTask, conversationID, assistantMsgID uint, content, mode string, conversation business.AIConversation) {
	var assistantContent strings.Builder
	var streamErr error

	streamCallback := func(chunk string) {
		assistantContent.WriteString(chunk)
		task.updateContent(assistantContent.String())

		// 实时保存到 DB
		if dbErr := global.JY_DB.Model(&business.AIMessage{}).Where("id = ?", assistantMsgID).Update("content", assistantContent.String()).Error; dbErr != nil {
			global.JY_LOG.Error("更新助手消息内容失败", zap.Error(dbErr))
		}

		task.notifySubscribers(chunk)
	}

	switch mode {
	case "aiserver_chat":
		var messages []business.AIMessage
		global.JY_DB.Where("conversation_id = ?", conversationID).Order("created_at ASC").Find(&messages)
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
	lastMsg := assistantContent.String()
	if len(lastMsg) > 100 {
		lastMsg = lastMsg[:100]
	}
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

// serveStream 主 goroutine：设置 SSE，先返回已累积内容，然后监听观察者 channel 推送新 chunk
func (a *Api) serveStream(c *gin.Context, task *generationTask, ch chan string) {
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

	// 先返回已累积的完整内容（resume 时尤为重要）
	existingContent := task.getContent()
	if existingContent != "" {
		data := map[string]interface{}{"content": existingContent, "done": false}
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		flusher.Flush()
	}

	defer task.removeSubscriber(ch)

	for {
		select {
		case chunk, ok := <-ch:
			if !ok {
				return
			}
			data := map[string]interface{}{"content": chunk, "done": false}
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()

		case <-task.done:
			if err := task.getError(); err != nil {
				errorData := map[string]interface{}{"error": err.Error(), "done": true}
				jsonErrorData, _ := json.Marshal(errorData)
				fmt.Fprintf(c.Writer, "data: %s\n\n", jsonErrorData)
			} else {
				endData := map[string]interface{}{"content": "", "done": true}
				jsonEndData, _ := json.Marshal(endData)
				fmt.Fprintf(c.Writer, "data: %s\n\n", jsonEndData)
			}
			flusher.Flush()
			return

		case <-c.Request.Context().Done():
			// 前端断开，主 goroutine 返回，但后台任务继续运行
			return
		}
	}
}

// serveResume 处理恢复模式：任务还在进行中
func (a *Api) serveResume(c *gin.Context, task *generationTask) {
	ch := make(chan string, 1000)
	task.addSubscriber(ch)

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

	// 先返回已累积的完整内容
	existingContent := task.getContent()
	if existingContent != "" {
		data := map[string]interface{}{"content": existingContent, "done": false}
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		flusher.Flush()
	}

	defer task.removeSubscriber(ch)

	for {
		select {
		case chunk, ok := <-ch:
			if !ok {
				return
			}
			data := map[string]interface{}{"content": chunk, "done": false}
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()

		case <-task.done:
			if err := task.getError(); err != nil {
				errorData := map[string]interface{}{"error": err.Error(), "done": true}
				jsonErrorData, _ := json.Marshal(errorData)
				fmt.Fprintf(c.Writer, "data: %s\n\n", jsonErrorData)
			} else {
				endData := map[string]interface{}{"content": "", "done": true}
				jsonEndData, _ := json.Marshal(endData)
				fmt.Fprintf(c.Writer, "data: %s\n\n", jsonEndData)
			}
			flusher.Flush()
			return

		case <-c.Request.Context().Done():
			return
		}
	}
}

// serveCompletedMessage 处理恢复模式：任务已完成，直接返回数据库中的内容
func (a *Api) serveCompletedMessage(c *gin.Context, msg business.AIMessage) {
	// 将残留的 loading 状态更新为 success
	global.JY_DB.Model(&business.AIMessage{}).Where("id = ? AND status = ?", msg.ID, "loading").
		Updates(map[string]interface{}{"status": "success"})

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

	if msg.Content != "" {
		data := map[string]interface{}{"content": msg.Content, "done": false}
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		flusher.Flush()
	}

	endData := map[string]interface{}{"content": "", "done": true}
	jsonEndData, _ := json.Marshal(endData)
	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonEndData)
	flusher.Flush()
}

// StreamCallback 流式回调函数类型
type StreamCallback func(chunk string)

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

	client := &http.Client{Timeout: 60 * time.Second}
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

	client := &http.Client{Timeout: 60 * time.Second}
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

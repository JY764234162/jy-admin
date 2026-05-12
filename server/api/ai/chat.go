package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// ChatMessage 发送消息（流式返回）
// @Summary      发送AI消息
// @Description  向AI发送消息并流式返回响应，支持 backend（LongCat）/ aiserver_chat / aiserver_knowledge 三种模式
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{conversationId=int,content=string,mode=string}  true  "会话ID、消息内容、模式"
// @Success      200   {string}  text/event-stream  "流式返回"
// @Router       /ai/chat [post]
func (a *Api) ChatMessage(c *gin.Context) {
	// 获取用户ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var req struct {
		ConversationID uint   `json:"conversationId"`
		Content        string `json:"content" binding:"required"`
		Mode           string `json:"mode"` // backend | aiserver_chat | aiserver_knowledge
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}
	if req.Mode == "" {
		req.Mode = "backend"
	}

	// 知识库问答模式不需要会话验证和消息持久化（纯代理）
	isKnowledgeMode := req.Mode == "aiserver_knowledge"

	var conversation business.AIConversation
	if !isKnowledgeMode {
		if req.ConversationID == 0 {
			common.FailWithMsg(c, "会话ID不能为空")
			return
		}
		// 验证会话是否属于当前用户
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
	}

	// 设置 SSE 响应头
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

	var assistantContent strings.Builder
	var err error

	switch req.Mode {
	case "aiserver_chat":
		// 获取会话历史消息（用于上下文）
		var messages []business.AIMessage
		global.JY_DB.Where("conversation_id = ?", req.ConversationID).Order("created_at ASC").Find(&messages)
		err = a.callAIServerChatStream(messages, req.Content, req.ConversationID, func(chunk string) {
			assistantContent.WriteString(chunk)
			data := map[string]interface{}{"content": chunk, "done": false}
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()
		})
	case "aiserver_knowledge":
		err = a.callAIServerKnowledgeStream(req.Content, func(chunk string) {
			assistantContent.WriteString(chunk)
			data := map[string]interface{}{"content": chunk, "done": false}
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()
		})
	default: // backend
		// 获取会话历史消息（用于上下文）
		var messages []business.AIMessage
		global.JY_DB.Where("conversation_id = ?", req.ConversationID).Order("created_at ASC").Find(&messages)
		err = a.callAIAPIStream(messages, req.Content, func(chunk string) {
			assistantContent.WriteString(chunk)
			data := map[string]interface{}{"content": chunk, "done": false}
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
			flusher.Flush()
		})
	}

	if err != nil {
		errorData := map[string]interface{}{"error": err.Error(), "done": true}
		jsonErrorData, _ := json.Marshal(errorData)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonErrorData)
		flusher.Flush()
		return
	}

	// 非知识库模式下保存助手消息并更新会话
	if !isKnowledgeMode {
		assistantMessage := business.AIMessage{
			ConversationID: req.ConversationID,
			Role:           "assistant",
			Content:        assistantContent.String(),
			UserID:         userID,
		}
		if err := global.JY_DB.Create(&assistantMessage).Error; err != nil {
			global.JY_LOG.Error("保存助手消息失败", zap.Error(err))
		}

		lastMsg := req.Content
		if len(lastMsg) > 100 {
			lastMsg = lastMsg[:100]
		}
		global.JY_DB.Model(&conversation).Updates(map[string]interface{}{
			"last_msg":      lastMsg,
			"message_count": conversation.MessageCount + 2,
		})
	}

	// 发送结束标记
	endData := map[string]interface{}{"content": "", "done": true}
	jsonEndData, _ := json.Marshal(endData)
	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonEndData)
	flusher.Flush()
}

// StreamCallback 流式回调函数类型
type StreamCallback func(chunk string)

// callAIAPIStream 调用外部 LongCat AI API（流式）
func (a *Api) callAIAPIStream(messages []business.AIMessage, newContent string, callback StreamCallback) error {
	apiKey := global.JY_Config.AI.LongCatAppKey

	if apiKey == "" {
		response := a.generateMockResponse(messages, newContent)
		runes := []rune(response)
		for i := 0; i < len(runes); i++ {
			chunk := string(runes[i])
			callback(chunk)
			if i < len(runes)-1 {
				time.Sleep(100 * time.Millisecond)
			}
		}
		return nil
	}

	type chatMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	const maxHistoryMessages = 20
	if len(messages) > maxHistoryMessages {
		messages = messages[len(messages)-maxHistoryMessages:]
	}

	var chatMessages []chatMessage
	chatMessages = append(chatMessages, chatMessage{
		Role:    "system",
		Content: "你是一个中文助手，请用简洁、直接的方式回答问题，优先给出结论，避免过长的解释。",
	})

	for _, m := range messages {
		role := "user"
		if m.Role == "assistant" {
			role = "assistant"
		}
		chatMessages = append(chatMessages, chatMessage{
			Role:    role,
			Content: m.Content,
		})
	}
	chatMessages = append(chatMessages, chatMessage{
		Role:    "user",
		Content: newContent,
	})

	model := global.JY_Config.AI.LongCatModel
	if model == "" {
		model = "LongCat-Flash-Chat"
	}

	payload := map[string]interface{}{
		"model":       model,
		"messages":    chatMessages,
		"max_tokens":  1024,
		"temperature": 0.7,
		"top_p":       0.9,
		"stream":      true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal LongCat payload error: %w", err)
	}

	req, err := http.NewRequest(
		http.MethodPost,
		"https://api.longcat.chat/openai/v1/chat/completions",
		strings.NewReader(string(body)),
	)
	if err != nil {
		return fmt.Errorf("create LongCat request error: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("call LongCat API error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("LongCat API status: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	type delta struct {
		Content string `json:"content"`
	}
	type choice struct {
		Delta delta `json:"delta"`
	}
	type streamChunk struct {
		Choices []choice `json:"choices"`
	}

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			break
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			global.JY_LOG.Error("解析 LongCat 流式数据失败", zap.Error(err), zap.String("data", data))
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		content := chunk.Choices[0].Delta.Content
		if content == "" {
			continue
		}
		callback(content)
		time.Sleep(80 * time.Millisecond)
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read LongCat stream error: %w", err)
	}
	return nil
}

// callAIServerChatStream 转发到 ai-server 基础对话（SSE 透传）
func (a *Api) callAIServerChatStream(messages []business.AIMessage, newContent string, conversationID uint, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://ai-server:8000"
	}

	// 构建消息历史（传给 ai-server，避免 ai-server 因 conversation_id 不存在而报错）
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
		"message": newContent,
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
		aiServerURL = "http://ai-server:8000"
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

// generateMockResponse 根据用户输入和历史消息生成模拟回复
func (a *Api) generateMockResponse(messages []business.AIMessage, newContent string) string {
	content := strings.ToLower(strings.TrimSpace(newContent))

	var response string

	if containsAny(content, []string{"你好", "hello", "hi", "在吗", "在"}) {
		greetings := []string{
			"你好！很高兴为你服务。有什么我可以帮助你的吗？",
			"你好！我是AI助手，有什么问题尽管问我。",
			"你好！今天有什么需要帮助的吗？",
		}
		response = greetings[rand.Intn(len(greetings))]
	} else if containsAny(content, []string{"谢谢", "thank", "感谢"}) {
		responses := []string{
			"不客气！如果还有其他问题，随时可以问我。",
			"很高兴能帮到你！",
			"不用谢，这是我应该做的。",
		}
		response = responses[rand.Intn(len(responses))]
	} else if containsAny(content, []string{"再见", "bye", "拜拜", "退出"}) {
		responses := []string{
			"再见！期待下次为你服务。",
			"再见！祝你一切顺利。",
			"好的，再见！有问题随时找我。",
		}
		response = responses[rand.Intn(len(responses))]
	} else if containsAny(content, []string{"介绍", "你是谁", "what", "who"}) {
		response = "我是一个AI助手，可以帮助你解答问题、提供信息和建议。我可以理解自然语言，并根据你的需求提供相应的帮助。"
	} else if containsAny(content, []string{"天气", "weather"}) {
		response = "抱歉，我目前无法获取实时天气信息。建议你查看天气应用或网站获取最新的天气情况。"
	} else if containsAny(content, []string{"时间", "time", "现在几点"}) {
		now := time.Now()
		response = fmt.Sprintf("现在是 %s。", now.Format("2006年01月02日 15:04:05"))
	} else if containsAny(content, []string{"代码", "code", "编程", "programming"}) {
		response = "关于编程问题，我可以提供一些建议和思路。不过具体的代码实现可能需要根据你的具体需求来定制。你可以告诉我更详细的需求，我会尽力帮助你。"
	} else if containsAny(content, []string{"帮助", "help", "怎么", "如何", "how"}) {
		response = "我可以帮助你解答问题、提供信息和建议。你可以问我任何问题，我会尽力回答。如果遇到我无法回答的问题，我会诚实地告诉你。"
	} else {
		if len(messages) <= 1 {
			defaultResponses := []string{
				"我理解你的问题。让我想想...",
				"这是一个有趣的问题。",
				"好的，让我来帮你分析一下。",
			}
			response = defaultResponses[rand.Intn(len(defaultResponses))]
		} else {
			response = fmt.Sprintf("关于「%s」这个问题，我可以从几个方面来回答：\n\n", newContent)
			response += "1. 首先，我需要了解你的具体需求。\n"
			response += "2. 其次，我可以提供一些相关的建议和思路。\n"
			response += "3. 最后，如果你有更详细的信息，我可以给出更精准的回答。\n\n"
			response += "你可以提供更多细节，这样我能更好地帮助你。"
		}
	}

	if utf8.RuneCountInString(response) < 50 {
		response += "\n\n如果你需要更详细的帮助，可以告诉我更多信息。"
	}

	return response
}

// containsAny 检查字符串是否包含任意一个关键词
func containsAny(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

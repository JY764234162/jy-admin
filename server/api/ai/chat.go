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
		Mode           string `json:"mode"` // aiserver_chat | aiserver_knowledge
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}
	if req.Mode == "" {
		req.Mode = "aiserver_chat"
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
	default:
		err = fmt.Errorf("不支持的对话模式: %s", req.Mode)
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

// callAIServerChatStream 转发到 ai-server 基础对话（SSE 透传）
func (a *Api) callAIServerChatStream(messages []business.AIMessage, newContent string, conversationID uint, callback StreamCallback) error {
	aiServerURL := global.JY_Config.AI.AIServerURL
	if aiServerURL == "" {
		aiServerURL = "http://localhost:8000"
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

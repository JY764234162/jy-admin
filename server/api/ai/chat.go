package ai

import (
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
// @Description  向AI发送消息并流式返回响应
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      text/event-stream
// @Param        data  body      object{conversationId=int,content=string}  true  "会话ID和消息内容"
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
		ConversationID uint   `json:"conversationId" binding:"required"`
		Content        string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}

	// 验证会话是否属于当前用户
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

	// 获取会话历史消息（用于上下文）
	var messages []business.AIMessage
	global.JY_DB.Where("conversation_id = ?", req.ConversationID).Order("created_at ASC").Find(&messages)

	// 设置 SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // 禁用 nginx 缓冲

	// 创建流式响应
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		common.FailWithMsg(c, "流式响应不支持")
		return
	}

	// 用于收集完整的助手回复
	var assistantContent strings.Builder

	// 调用 AI API（流式调用）
	err := a.callAIAPIStream(messages, req.Content, func(chunk string) {
		// 收集完整回复
		assistantContent.WriteString(chunk)

		// 流式发送每个数据块
		data := map[string]interface{}{
			"content": chunk,
			"done":    false,
		}
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		flusher.Flush()
	})

	if err != nil {
		// 发送错误信息
		errorData := map[string]interface{}{
			"error": err.Error(),
			"done":  true,
		}
		jsonErrorData, _ := json.Marshal(errorData)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonErrorData)
		flusher.Flush()
		return
	}

	// 保存助手消息
	assistantMessage := business.AIMessage{
		ConversationID: req.ConversationID,
		Role:           "assistant",
		Content:        assistantContent.String(),
		UserID:         userID,
	}
	if err := global.JY_DB.Create(&assistantMessage).Error; err != nil {
		// 记录错误但不中断流式返回
		global.JY_LOG.Error("保存助手消息失败", zap.Error(err))
	}

	// 更新会话的最后消息和消息数量
	lastMsg := req.Content
	if len(lastMsg) > 100 {
		lastMsg = lastMsg[:100]
	}
	global.JY_DB.Model(&conversation).Updates(map[string]interface{}{
		"last_msg":      lastMsg,
		"message_count": conversation.MessageCount + 2, // 用户消息 + 助手消息
	})

	// 发送结束标记
	endData := map[string]interface{}{
		"content": "",
		"done":    true,
	}
	jsonEndData, _ := json.Marshal(endData)
	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonEndData)
	flusher.Flush()
}

// StreamCallback 流式回调函数类型
type StreamCallback func(chunk string)

// callAIAPIStream 调用 AI API（Mock 实现，模拟流式返回）
func (a *Api) callAIAPIStream(messages []business.AIMessage, newContent string, callback StreamCallback) error {
	// 生成基于用户输入的智能回复
	response := a.generateMockResponse(messages, newContent)

	// 模拟流式返回：逐字符发送，模拟真实的 AI API 流式响应
	// 这样可以更好地测试前端的流式接收功能
	runes := []rune(response)
	for i := 0; i < len(runes); i++ {
		chunk := string(runes[i])
		callback(chunk)

		// 模拟流式输出速度：0.05 秒一个字
		if i < len(runes)-1 {
			time.Sleep(50 * time.Millisecond)
		}
	}

	return nil
}

// generateMockResponse 根据用户输入和历史消息生成模拟回复
func (a *Api) generateMockResponse(messages []business.AIMessage, newContent string) string {
	content := strings.ToLower(strings.TrimSpace(newContent))

	// 根据用户输入的关键词生成不同的回复
	var response string

	// 问候语
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
		// 默认回复：根据历史消息判断是否是首次对话
		if len(messages) <= 1 {
			// 首次对话
			defaultResponses := []string{
				"我理解你的问题。让我想想...",
				"这是一个有趣的问题。",
				"好的，让我来帮你分析一下。",
			}
			response = defaultResponses[rand.Intn(len(defaultResponses))]
		} else {
			// 有历史对话，提供更相关的回复
			response = fmt.Sprintf("关于「%s」这个问题，我可以从几个方面来回答：\n\n", newContent)
			response += "1. 首先，我需要了解你的具体需求。\n"
			response += "2. 其次，我可以提供一些相关的建议和思路。\n"
			response += "3. 最后，如果你有更详细的信息，我可以给出更精准的回答。\n\n"
			response += "你可以提供更多细节，这样我能更好地帮助你。"
		}
	}

	// 如果回复太短，添加一些补充内容
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

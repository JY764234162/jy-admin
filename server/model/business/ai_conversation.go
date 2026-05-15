package business

import (
	"time"

	"gorm.io/gorm"
)

// AIConversation AI 会话表
type AIConversation struct {
	gorm.Model
	UpdatedAt time.Time `json:"updatedAt" gorm:"index;comment:更新时间"`
	UserID    uint      `json:"userId" gorm:"index;comment:用户ID"`
	Title     string `json:"title" gorm:"comment:会话标题"`
	LastMsg   string `json:"lastMsg" gorm:"type:text;comment:最后一条消息"`
	MessageCount int `json:"messageCount" gorm:"default:0;comment:消息数量"`
}

// AIMessage AI 消息表
type AIMessage struct {
	gorm.Model
	ConversationID uint   `json:"conversationId" gorm:"index;comment:会话ID"`
	Role           string `json:"role" gorm:"comment:角色: user, assistant"`
	Content        string `json:"content" gorm:"type:text;comment:消息内容"`
	UserID         uint   `json:"userId" gorm:"index;comment:用户ID"`
	Status         string `json:"status" gorm:"default:'success';comment:状态: loading/success/error"`
	Attachments    string `json:"attachments" gorm:"type:json;comment:附件JSON"`
}

package ai

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// CreateConversation 创建会话
// @Summary      创建AI会话
// @Description  创建新的AI对话会话
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        data  body      object{title=string}  true  "会话标题"
// @Success      200   {object}  common.Response{data=business.AIConversation,msg=string}  "创建成功"
// @Router       /ai/conversation [post]
func (a *Api) CreateConversation(c *gin.Context) {
	// 获取用户ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var req struct {
		Title string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}

	conversation := business.AIConversation{
		UserID:        userID,
		Title:         req.Title,
		MessageCount:  0,
	}

	if err := global.JY_DB.Create(&conversation).Error; err != nil {
		common.FailWithMsg(c, "创建会话失败")
		return
	}

	common.OkWithData(c, conversation)
}

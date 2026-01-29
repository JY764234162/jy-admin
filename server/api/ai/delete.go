package ai

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// DeleteConversation 删除会话
// @Summary      删除AI会话
// @Description  删除指定的AI对话会话及其所有消息
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        id   path      int              true  "会话ID"
// @Success      200  {object}  common.Response{msg=string}  "删除成功"
// @Router       /ai/conversation/{id} [delete]
func (a *Api) DeleteConversation(c *gin.Context) {
	// 获取用户ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		common.FailWithMsg(c, "参数错误")
		return
	}

	// 验证会话是否属于当前用户
	var conversation business.AIConversation
	if err := global.JY_DB.Where("id = ? AND user_id = ?", id, userID).First(&conversation).Error; err != nil {
		common.FailWithMsg(c, "会话不存在或无权限")
		return
	}

	// 删除会话下的所有消息
	global.JY_DB.Where("conversation_id = ?", id).Delete(&business.AIMessage{})

	// 删除会话
	if err := global.JY_DB.Delete(&conversation).Error; err != nil {
		common.FailWithMsg(c, "删除失败")
		return
	}

	common.OkWithMsg(c, "删除成功")
}

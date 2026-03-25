package ai

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// UpdateConversationTitle 更新会话标题
// @Summary      更新AI会话标题
// @Description  更新指定的AI对话会话标题（仅允许修改当前用户所属会话）
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        id    path      int    true  "会话ID"
// @Param        data  body      object{title=string} true "会话新标题"
// @Success      200   {object}  common.Response{msg=string} "更新成功"
// @Router       /ai/conversation/{id}/title [put]
func (a *Api) UpdateConversationTitle(c *gin.Context) {
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

	var req struct {
		Title string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(c, "参数错误: "+err.Error())
		return
	}

	newTitle := strings.TrimSpace(req.Title)
	if newTitle == "" {
		common.FailWithMsg(c, "标题不能为空")
		return
	}

	// 验证会话是否属于当前用户
	var conversation business.AIConversation
	if err := global.JY_DB.Where("id = ? AND user_id = ?", id, userID).First(&conversation).Error; err != nil {
		common.FailWithMsg(c, "会话不存在或无权限")
		return
	}

	if err := global.JY_DB.Model(&conversation).Updates(map[string]interface{}{
		"title": newTitle,
	}).Error; err != nil {
		common.FailWithMsg(c, "更新失败")
		return
	}

	common.OkWithMsg(c, "更新成功")
}


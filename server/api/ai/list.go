package ai

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

type SearchConversation struct {
	Page     int `json:"page" form:"page"`
	PageSize int `json:"pageSize" form:"pageSize"`
}

// GetConversationList 获取会话列表
// @Summary      获取AI会话列表
// @Description  分页获取当前用户的AI对话会话列表
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        data  query     SearchConversation  true  "页码, 每页大小"
// @Success      200   {object}  common.Response{data=common.PageResult,msg=string}  "获取成功"
// @Router       /ai/conversation/list [get]
func (a *Api) GetConversationList(c *gin.Context) {
	// 获取用户ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "未登录")
		return
	}
	customClaims := claims.(*utils.CustomClaims)
	userID := customClaims.ID

	var search SearchConversation
	_ = c.ShouldBindQuery(&search)
	if search.Page == 0 {
		search.Page = 1
	}
	if search.PageSize == 0 {
		search.PageSize = 10
	}

	var conversations []business.AIConversation
	var total int64
	db := global.JY_DB.Model(&business.AIConversation{}).Where("user_id = ?", userID)
	err := db.Count(&total).Error
	if err != nil {
		common.FailWithMsg(c, "统计失败")
		return
	}
	err = db.Order("updated_at DESC").Limit(search.PageSize).Offset((search.Page - 1) * search.PageSize).Find(&conversations).Error
	if err != nil {
		common.FailWithMsg(c, "获取列表失败")
		return
	}

	common.OkWithData(c, common.PageResult{
		List:     conversations,
		Total:    total,
		Page:     search.Page,
		PageSize: search.PageSize,
	})
}

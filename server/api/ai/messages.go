package ai

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

// MessageListParams 消息列表分页参数
type MessageListParams struct {
	Page     int `form:"page"`
	PageSize int `form:"pageSize"`
}

// GetMessageList 获取会话消息列表（分页，按时间倒序，默认最近10条）
// @Summary      获取会话消息列表
// @Description  分页获取指定会话的消息，按时间倒序（最新的在前）
// @Security     ApiKeyAuth
// @Tags         AI
// @Accept       json
// @Produce      json
// @Param        id        path      int  true  "会话ID"
// @Param        page      query     int  false "页码，默认1"
// @Param        pageSize  query     int  false "每页条数，默认10"
// @Success      200       {object}  common.Response{data=common.PageResult,msg=string}  "获取成功"
// @Router       /ai/conversation/{id}/messages [get]
func (a *Api) GetMessageList(c *gin.Context) {
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

	var params MessageListParams
	_ = c.ShouldBindQuery(&params)
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 10
	}

	// 按创建时间倒序（最新的在前），分页
	var messages []business.AIMessage
	var total int64
	db := global.JY_DB.Model(&business.AIMessage{}).Where("conversation_id = ?", id)
	if err := db.Count(&total).Error; err != nil {
		common.FailWithMsg(c, "统计失败")
		return
	}
	if err := db.Order("created_at DESC").
		Limit(params.PageSize).
		Offset((params.Page - 1) * params.PageSize).
		Find(&messages).Error; err != nil {
		common.FailWithMsg(c, "获取消息列表失败")
		return
	}

	common.OkWithData(c, common.PageResult{
		List:     messages,
		Total:    total,
		Page:     params.Page,
		PageSize: params.PageSize,
	})
}

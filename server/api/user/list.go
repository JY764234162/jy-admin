package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

type SearchUser struct {
	Page     int `json:"page" form:"page"`
	PageSize int `json:"pageSize" form:"pageSize"`
}

// GetUserList 获取用户列表
// @Summary      分页获取用户列表
// @Description  分页获取用户列表
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  query     SearchUser       true  "页码, 每页大小"
// @Success      200   {object}  common.Response{data=common.PageResult,msg=string}  "获取成功"
// @Router       /user/list [get]
func (a *Api) GetUserList(c *gin.Context) {
	var search SearchUser
	_ = c.ShouldBindQuery(&search)
	if search.Page == 0 {
		search.Page = 1
	}
	if search.PageSize == 0 {
		search.PageSize = 10
	}
	var users []system.SysUser
	var total int64
	db := global.JY_DB.Model(&system.SysUser{})
	err := db.Count(&total).Error
	if err != nil {
		common.FailWithMsg(c, "统计失败")
		return
	}
	err = db.Limit(search.PageSize).Offset((search.Page - 1) * search.PageSize).Find(&users).Error
	if err != nil {
		common.FailWithMsg(c, "获取列表失败")
		return
	}
	common.OkWithData(c, common.PageResult{
		List:     users,
		Total:    total,
		Page:     search.Page,
		PageSize: search.PageSize,
	})
}

package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// UpdateUser 更新用户
// @Summary      更新用户
// @Description  更新用户
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysUser   true  "用户ID, 昵称, 头像, 角色ID"
// @Success      200   {object}  common.Response{msg=string}  "更新成功"
// @Router       /user [put]
func (a *Api) UpdateUser(c *gin.Context) {
	var user system.SysUser
	err := c.ShouldBindJSON(&user)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}
	// 不允许通过此接口直接修改密码，如果有密码修改需求应走专门的接口
	user.Password = ""
	err = global.JY_DB.Model(&system.SysUser{}).Where("id = ?", user.ID).Updates(&user).Error
	if err != nil {
		common.FailWithMsg(c, "更新用户失败")
		return
	}
	common.OkWithMsg(c, "更新成功")
}

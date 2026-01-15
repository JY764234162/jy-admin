package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// CreateUser 创建用户
// @Summary      创建用户
// @Description  创建用户
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysUser   true  "用户名, 昵称, 头像, 角色ID"
// @Success      200   {object}  common.Response{msg=string}  "创建成功"
// @Router       /user [post]
func (a *Api) CreateUser(c *gin.Context) {
	var user system.SysUser
	err := c.ShouldBindJSON(&user)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}
	user.Password = utils.BcryptHash(user.Password)
	err = global.JY_DB.Create(&user).Error
	if err != nil {
		common.FailWithMsg(c, "用户名重复")
		return
	}
	common.OkWithMsg(c, "创建成功")
}

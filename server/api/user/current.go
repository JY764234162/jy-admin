package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// GetCurrentUser 获取当前用户信息
// @Summary      获取当前用户信息
// @Description  获取当前登录用户的信息
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Success      200   {object}  common.Response{data=system.SysUser,msg=string}  "获取成功"
// @Router       /user/current [get]
func (a *Api) GetCurrentUser(c *gin.Context) {
	// 从 JWT claims 中获取当前登录用户的 ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "获取用户信息失败")
		return
	}
	waitClaims := claims.(*utils.CustomClaims)

	var user system.SysUser
	err := global.JY_DB.Where("id = ?", waitClaims.ID).First(&user).Error
	if err != nil {
		common.FailWithMsg(c, "用户不存在")
		return
	}

	common.OkWithDetailed(c, user, "获取成功")
}

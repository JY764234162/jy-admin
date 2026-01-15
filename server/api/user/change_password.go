package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

type ChangePasswordRequest struct {
	OldPassword string `json:"oldPassword"` // 旧密码
	NewPassword string `json:"newPassword"` // 新密码
}

// ChangePassword 修改密码
// @Summary      修改用户密码
// @Description  修改用户密码
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  body      ChangePasswordRequest  true  "旧密码, 新密码"
// @Success      200   {object}  common.Response{msg=string}  "修改成功"
// @Router       /user/changePassword [post]
func (a *Api) ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	// 从 JWT claims 中获取当前登录用户的 ID
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "获取用户信息失败")
		return
	}
	waitClaims := claims.(*utils.CustomClaims)

	var user system.SysUser
	err = global.JY_DB.Where("id = ?", waitClaims.ID).First(&user).Error
	if err != nil {
		common.FailWithMsg(c, "用户不存在")
		return
	}

	// 验证旧密码
	if ok := utils.BcryptCheck(req.OldPassword, user.Password); !ok {
		common.FailWithMsg(c, "旧密码错误")
		return
	}

	// 更新为新密码
	user.Password = utils.BcryptHash(req.NewPassword)
	err = global.JY_DB.Save(&user).Error
	if err != nil {
		common.FailWithMsg(c, "修改密码失败")
		return
	}

	common.OkWithMsg(c, "修改密码成功")
}

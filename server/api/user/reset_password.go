package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

type ResetPasswordRequest struct {
	UserID      uint   `json:"userId" binding:"required"`      // 用户ID
	NewPassword string `json:"newPassword" binding:"required"` // 新密码
}

// ResetPassword 管理员重置用户密码
// @Summary      管理员重置用户密码
// @Description  管理员重置用户密码（不需要旧密码）
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  body      ResetPasswordRequest  true  "用户ID, 新密码"
// @Success      200   {object}  common.Response{msg=string}  "重置成功"
// @Router       /user/resetPassword [post]
func (a *Api) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	// 验证新密码长度
	if len(req.NewPassword) < 6 {
		common.FailWithMsg(c, "密码长度不能少于6位")
		return
	}

	// 查找用户
	var user system.SysUser
	err = global.JY_DB.Where("id = ?", req.UserID).First(&user).Error
	if err != nil {
		common.FailWithMsg(c, "用户不存在")
		return
	}

	// 更新密码
	user.Password = utils.BcryptHash(req.NewPassword)
	err = global.JY_DB.Save(&user).Error
	if err != nil {
		common.FailWithMsg(c, "重置密码失败")
		return
	}

	common.OkWithMsg(c, "重置密码成功")
}

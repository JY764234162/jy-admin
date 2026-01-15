package user

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

type UpdateProfileRequest struct {
	NickName  string `json:"nickName" binding:"required"`
	HeaderImg string `json:"headerImg"`
}

// UpdateProfile 更新个人资料
// @Summary      更新个人资料
// @Description  更新当前登录用户的昵称和头像
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        data  body      UpdateProfileRequest  true  "昵称, 头像"
// @Success      200   {object}  common.Response{data=system.SysUser,msg=string}  "更新成功"
// @Router       /user/profile [put]
func (a *Api) UpdateProfile(c *gin.Context) {
	var req UpdateProfileRequest
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

	// 检查昵称是否已被其他用户使用
	if req.NickName != user.NickName {
		var existingUser system.SysUser
		err = global.JY_DB.Where("nick_name = ? AND id != ?", req.NickName, waitClaims.ID).First(&existingUser).Error
		if err == nil {
			common.FailWithMsg(c, "昵称已被使用")
			return
		}
	}

	// 更新用户信息
	user.NickName = req.NickName
	if req.HeaderImg != "" {
		user.HeaderImg = req.HeaderImg
	}

	err = global.JY_DB.Save(&user).Error
	if err != nil {
		common.FailWithMsg(c, "更新失败")
		return
	}

	common.OkWithDetailed(c, user, "更新成功")
}

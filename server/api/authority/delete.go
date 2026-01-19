package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// DeleteAuthority 删除角色
// @Summary      删除角色
// @Description  删除角色（会检查是否有用户使用该角色）
// @Security     ApiKeyAuth
// @Tags         Authority
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysAuthority  true  "角色ID"
// @Success      200   {object}  common.Response{msg=string}  "删除成功"
// @Router       /authority [delete]
func (a *Api) DeleteAuthority(c *gin.Context) {
	var auth system.SysAuthority
	err := c.ShouldBindJSON(&auth)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	// 检查是否有用户使用该角色
	var userCount int64
	global.JY_DB.Model(&system.SysUser{}).Where("authority_id = ?", auth.AuthorityId).Count(&userCount)
	if userCount > 0 {
		common.FailWithMsg(c, "该角色已被用户使用，无法删除")
		return
	}

	// 检查是否有子角色
	var childCount int64
	global.JY_DB.Model(&system.SysAuthority{}).Where("parent_id = ?", auth.AuthorityId).Count(&childCount)
	if childCount > 0 {
		common.FailWithMsg(c, "该角色下存在子角色，无法删除")
		return
	}

	// 删除角色
	err = global.JY_DB.Where("authority_id = ?", auth.AuthorityId).Delete(&system.SysAuthority{}).Error
	if err != nil {
		common.FailWithMsg(c, "删除角色失败")
		return
	}
	common.OkWithMsg(c, "删除成功")
}

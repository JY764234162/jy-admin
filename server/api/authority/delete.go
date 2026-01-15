package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// DeleteAuthority 删除角色
// @Summary      删除角色
// @Description  删除角色
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
	// 简单逻辑：直接按主键或唯一ID删除
	err = global.JY_DB.Where("authority_id = ?", auth.AuthorityId).Delete(&system.SysAuthority{}).Error
	if err != nil {
		common.FailWithMsg(c, "删除角色失败")
		return
	}
	common.OkWithMsg(c, "删除成功")
}

package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// UpdateAuthority 更新角色
// @Summary      更新角色
// @Description  更新角色
// @Security     ApiKeyAuth
// @Tags         Authority
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysAuthority  true  "角色ID, 角色名, 父角色ID"
// @Success      200   {object}  common.Response{msg=string}  "更新成功"
// @Router       /authority [put]
func (a *Api) UpdateAuthority(c *gin.Context) {
	var auth system.SysAuthority
	err := c.ShouldBindJSON(&auth)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}
	err = global.JY_DB.Where("authority_id = ?", auth.AuthorityId).Updates(&auth).Error
	if err != nil {
		common.FailWithMsg(c, "更新角色失败")
		return
	}
	common.OkWithMsg(c, "更新成功")
}

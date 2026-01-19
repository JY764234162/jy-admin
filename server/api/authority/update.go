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
	// 使用 map 更新，确保 enable 字段（即使是 false）也能正确更新
	updateData := map[string]interface{}{
		"authority_name": auth.AuthorityName,
		"parent_id":      auth.ParentId,
		"default_router": auth.DefaultRouter,
		"enable":         auth.Enable,
	}
	err = global.JY_DB.Model(&system.SysAuthority{}).Where("authority_id = ?", auth.AuthorityId).Updates(updateData).Error
	if err != nil {
		common.FailWithMsg(c, "更新角色失败")
		return
	}
	common.OkWithMsg(c, "更新成功")
}

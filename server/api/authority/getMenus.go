package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// GetAuthorityMenus 获取角色的菜单权限
// @Summary      获取角色的菜单权限
// @Description  获取角色的菜单权限
// @Security     ApiKeyAuth
// @Tags         Authority
// @Produce      json
// @Param        authorityId  query     string  true  "角色ID"
// @Success      200   {object}  common.Response{data=[]system.SysBaseMenu,msg=string}  "获取成功"
// @Router       /authority/getMenus [get]
func (a *Api) GetAuthorityMenus(c *gin.Context) {
	authorityId := c.Query("authorityId")
	if authorityId == "" {
		common.FailWithMsg(c, "角色ID不能为空")
		return
	}

	// 查找角色
	var authority system.SysAuthority
	err := global.JY_DB.Where("authority_id = ?", authorityId).First(&authority).Error
	if err != nil {
		common.FailWithMsg(c, "角色不存在")
		return
	}

	// 获取角色的菜单
	var menus []system.SysBaseMenu
	err = global.JY_DB.Model(&authority).Association("SysBaseMenus").Find(&menus)
	if err != nil {
		common.FailWithMsg(c, "获取菜单权限失败")
		return
	}

	common.OkWithData(c, menus)
}

package menu

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// DeleteMenu 删除菜单
// @Summary      删除菜单
// @Description  删除菜单（会检查是否有子菜单）
// @Security     ApiKeyAuth
// @Tags         Menu
// @Accept       json
// @Produce      json
// @Param        id  path      int  true  "菜单ID"
// @Success      200   {object}  common.Response{msg=string}  "删除成功"
// @Router       /menu/:id [delete]
func (a *Api) DeleteMenu(c *gin.Context) {
	menuId := c.Param("id")
	if menuId == "" {
		common.FailWithMsg(c, "菜单ID不能为空")
		return
	}

	// 检查是否有子菜单
	var childCount int64
	global.JY_DB.Model(&system.SysBaseMenu{}).Where("parent_id = ?", menuId).Count(&childCount)
	if childCount > 0 {
		common.FailWithMsg(c, "该菜单下存在子菜单，无法删除")
		return
	}

	// 检查是否有角色使用该菜单
	var authorityCount int64
	global.JY_DB.Table("sys_authority_menus").Where("sys_base_menu_id = ?", menuId).Count(&authorityCount)
	if authorityCount > 0 {
		common.FailWithMsg(c, "该菜单已被角色使用，无法删除")
		return
	}

	err := global.JY_DB.Delete(&system.SysBaseMenu{}, menuId).Error
	if err != nil {
		common.FailWithMsg(c, "删除菜单失败")
		return
	}
	common.OkWithMsg(c, "删除成功")
}

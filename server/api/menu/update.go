package menu

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// UpdateMenu 更新菜单
// @Summary      更新菜单
// @Description  更新菜单
// @Security     ApiKeyAuth
// @Tags         Menu
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysBaseMenu  true  "菜单信息"
// @Success      200   {object}  common.Response{data=system.SysBaseMenu,msg=string}  "更新成功"
// @Router       /menu [put]
func (a *Api) UpdateMenu(c *gin.Context) {
	var menu system.SysBaseMenu
	err := c.ShouldBindJSON(&menu)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	if menu.ID == 0 {
		common.FailWithMsg(c, "菜单ID不能为空")
		return
	}

	err = global.JY_DB.Model(&system.SysBaseMenu{}).Where("id = ?", menu.ID).Updates(&menu).Error
	if err != nil {
		common.FailWithMsg(c, "更新菜单失败")
		return
	}
	common.OkWithDetailed(c, menu, "更新成功")
}

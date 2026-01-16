package menu

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// CreateMenu 创建菜单
// @Summary      创建菜单
// @Description  创建菜单
// @Security     ApiKeyAuth
// @Tags         Menu
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysBaseMenu  true  "菜单信息"
// @Success      200   {object}  common.Response{data=system.SysBaseMenu,msg=string}  "创建成功"
// @Router       /menu [post]
func (a *Api) CreateMenu(c *gin.Context) {
	var menu system.SysBaseMenu
	err := c.ShouldBindJSON(&menu)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	// 如果没有指定父菜单ID，默认为"0"
	if menu.ParentId == "" {
		menu.ParentId = "0"
	}

	err = global.JY_DB.Create(&menu).Error
	if err != nil {
		common.FailWithMsg(c, "创建菜单失败")
		return
	}
	common.OkWithDetailed(c, menu, "创建成功")
}

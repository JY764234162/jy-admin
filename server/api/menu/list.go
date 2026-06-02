package menu

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// MenuTreeItem 菜单树结构
type MenuTreeItem struct {
	system.SysBaseMenu
	Children []MenuTreeItem `json:"children"`
}

// GetMenuList 获取菜单列表
// @Summary      获取菜单列表
// @Description  获取菜单列表（树形结构）
// @Security     ApiKeyAuth
// @Tags         Menu
// @Produce      json
// @Success      200  {object}  common.Response{data=[]MenuTreeItem,msg=string}  "获取成功"
// @Router       /menu/list [get]
func (a *Api) GetMenuList(c *gin.Context) {
	var menus []system.SysBaseMenu
	err := global.JY_DB.Order("sort ASC").Find(&menus).Error
	if err != nil {
		common.FailWithMsg(c, "获取菜单列表失败")
		return
	}

	// 构建树形结构
	treeMenus := buildMenuTree(menus, "0")
	common.OkWithData(c, treeMenus)
}

// buildMenuTree 构建菜单树
func buildMenuTree(menus []system.SysBaseMenu, parentId string) []MenuTreeItem {
	var tree []MenuTreeItem
	for _, menu := range menus {
		if menu.ParentId == parentId {
			children := buildMenuTree(menus, fmt.Sprintf("%d", menu.ID))
			tree = append(tree, MenuTreeItem{
				SysBaseMenu: menu,
				Children:    children,
			})
		}
	}
	return tree
}

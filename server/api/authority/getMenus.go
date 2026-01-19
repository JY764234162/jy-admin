package authority

import (
	"fmt"
	"sort"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// MenuTreeItem 菜单树结构
type MenuTreeItem struct {
	system.SysBaseMenu
	Children []MenuTreeItem `json:"children"`
}

// GetAuthorityMenus 获取当前用户的菜单权限（树状结构）
// @Summary      获取当前用户的菜单权限
// @Description  从token中解析用户角色，获取该角色的菜单权限（树状结构）。如果角色被禁用，返回空菜单
// @Security     ApiKeyAuth
// @Tags         Authority
// @Produce      json
// @Success      200   {object}  common.Response{data=[]MenuTreeItem,msg=string}  "获取成功"
// @Router       /authority/getMenus [get]
func (a *Api) GetAuthorityMenus(c *gin.Context) {
	// 从JWT中获取用户信息
	claims, exists := c.Get("claims")
	if !exists {
		common.FailWithMsg(c, "获取用户信息失败")
		return
	}

	waitClaims := claims.(*utils.CustomClaims)
	authorityId := waitClaims.AuthorityId

	if authorityId == "" {
		common.FailWithMsg(c, "用户角色ID不存在")
		return
	}

	// 获取菜单权限（树状结构），如果角色被禁用则返回空菜单
	treeMenus := a.getMenusByAuthorityId(authorityId, true)
	if treeMenus == nil {
		common.FailWithMsg(c, "获取菜单权限失败")
		return
	}

	common.OkWithData(c, treeMenus)
}

// GetAuthorityMenusByRole 根据角色ID获取菜单权限（用于角色管理页面）
// @Summary      根据角色ID获取菜单权限
// @Description  根据角色ID获取该角色的菜单权限（树状结构），用于角色管理页面。不判断角色是否禁用，直接返回该角色的所有菜单
// @Security     ApiKeyAuth
// @Tags         Authority
// @Produce      json
// @Param        authorityId  query     string  true  "角色ID"
// @Success      200   {object}  common.Response{data=[]MenuTreeItem,msg=string}  "获取成功"
// @Router       /authority/getMenusByRole [get]
func (a *Api) GetAuthorityMenusByRole(c *gin.Context) {
	authorityId := c.Query("authorityId")
	if authorityId == "" {
		common.FailWithMsg(c, "角色ID不能为空")
		return
	}

	// 获取菜单权限（树状结构），不判断角色是否禁用
	treeMenus := a.getMenusByAuthorityId(authorityId, false)
	if treeMenus == nil {
		common.FailWithMsg(c, "获取菜单权限失败")
		return
	}

	common.OkWithData(c, treeMenus)
}

// getMenusByAuthorityId 根据角色ID获取菜单权限（内部方法）
// checkRoleEnable: true-检查角色状态（如果角色被禁用返回空菜单），false-不检查角色状态（用于角色管理页面）
func (a *Api) getMenusByAuthorityId(authorityId string, checkRoleEnable bool) []MenuTreeItem {
	// 查找角色
	var authority system.SysAuthority
	err := global.JY_DB.Where("authority_id = ?", authorityId).First(&authority).Error
	if err != nil {
		return nil
	}

	// 如果需要检查角色状态，且角色被禁用，返回空菜单
	if checkRoleEnable && !authority.Enable {
		return []MenuTreeItem{}
	}

	// 获取角色的菜单
	var menus []system.SysBaseMenu
	err = global.JY_DB.Model(&authority).Association("SysBaseMenus").Find(&menus)
	if err != nil {
		return nil
	}

	// 如果没有菜单数据，返回空数组（不是nil）
	if len(menus) == 0 {
		return []MenuTreeItem{}
	}

	// 过滤掉禁用的菜单（无论是否检查角色状态，都要过滤禁用的菜单）
	var enabledMenus []system.SysBaseMenu
	for _, menu := range menus {
		if menu.Enable {
			enabledMenus = append(enabledMenus, menu)
		}
	}

	// 如果没有启用的菜单，返回空数组
	if len(enabledMenus) == 0 {
		return []MenuTreeItem{}
	}

	// 按排序字段排序（使用更高效的排序方式）
	sort.Slice(enabledMenus, func(i, j int) bool {
		return enabledMenus[i].Sort < enabledMenus[j].Sort
	})

	// 构建树形结构
	return buildMenuTree(enabledMenus, "0")
}

// buildMenuTree 构建菜单树（只包含启用的菜单）
func buildMenuTree(menus []system.SysBaseMenu, parentId string) []MenuTreeItem {
	var tree []MenuTreeItem
	for _, menu := range menus {
		// 只处理启用的菜单
		if menu.ParentId == parentId && menu.Enable {
			children := buildMenuTree(menus, fmt.Sprintf("%d", menu.ID))
			tree = append(tree, MenuTreeItem{
				SysBaseMenu: menu,
				Children:    children,
			})
		}
	}
	return tree
}

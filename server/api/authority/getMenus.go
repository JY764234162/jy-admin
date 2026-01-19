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
// @Description  从token中解析用户角色，获取该角色的菜单权限（树状结构）
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

	// 获取菜单权限（树状结构）
	treeMenus := a.getMenusByAuthorityId(authorityId)
	if treeMenus == nil {
		common.FailWithMsg(c, "获取菜单权限失败")
		return
	}

	common.OkWithData(c, treeMenus)
}

// GetAuthorityMenusByRole 根据角色ID获取菜单权限（用于角色管理页面）
// @Summary      根据角色ID获取菜单权限
// @Description  根据角色ID获取该角色的菜单权限（树状结构），用于角色管理页面
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

	// 获取菜单权限（树状结构）
	treeMenus := a.getMenusByAuthorityId(authorityId)
	if treeMenus == nil {
		common.FailWithMsg(c, "获取菜单权限失败")
		return
	}

	common.OkWithData(c, treeMenus)
}

// getMenusByAuthorityId 根据角色ID获取菜单权限（内部方法）
func (a *Api) getMenusByAuthorityId(authorityId string) []MenuTreeItem {
	// 查找角色
	var authority system.SysAuthority
	err := global.JY_DB.Where("authority_id = ?", authorityId).First(&authority).Error
	if err != nil {
		return nil
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

	// 按排序字段排序（使用更高效的排序方式）
	sort.Slice(menus, func(i, j int) bool {
		return menus[i].Sort < menus[j].Sort
	})

	// 构建树形结构
	return buildMenuTree(menus, "0")
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

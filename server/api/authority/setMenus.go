package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

type SetAuthorityMenusRequest struct {
	AuthorityId string `json:"authorityId" binding:"required"`
	MenuIds     []uint `json:"menuIds"`
}

// SetAuthorityMenus 设置角色的菜单权限
// @Summary      设置角色的菜单权限
// @Description  设置角色的菜单权限
// @Security     ApiKeyAuth
// @Tags         Authority
// @Accept       json
// @Produce      json
// @Param        data  body      SetAuthorityMenusRequest  true  "角色ID, 菜单ID列表"
// @Success      200   {object}  common.Response{msg=string}  "设置成功"
// @Router       /authority/setMenus [post]
func (a *Api) SetAuthorityMenus(c *gin.Context) {
	var req SetAuthorityMenusRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}

	// 查找角色
	var authority system.SysAuthority
	err = global.JY_DB.Where("authority_id = ?", req.AuthorityId).First(&authority).Error
	if err != nil {
		common.FailWithMsg(c, "角色不存在")
		return
	}

	// 查找菜单
	var menus []system.SysBaseMenu
	if len(req.MenuIds) > 0 {
		err = global.JY_DB.Where("id IN ?", req.MenuIds).Find(&menus).Error
		if err != nil {
			common.FailWithMsg(c, "查找菜单失败")
			return
		}
	}

	// 替换角色的菜单关联
	err = global.JY_DB.Model(&authority).Association("SysBaseMenus").Replace(menus)
	if err != nil {
		common.FailWithMsg(c, "设置菜单权限失败")
		return
	}

	common.OkWithMsg(c, "设置成功")
}

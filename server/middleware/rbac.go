package middleware

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// RBACAuth 基于角色的权限验证中间件
// 检查当前用户是否有权限访问该路由
func RBACAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从JWT中获取用户信息
		claims, exists := c.Get("claims")
		if !exists {
			common.FailWithMsg(c, "获取用户信息失败")
			c.Abort()
			return
		}

		waitClaims := claims.(*utils.CustomClaims)
		authorityId := waitClaims.AuthorityId

		// 获取请求的路径和方法
		path := c.Request.URL.Path
		method := c.Request.Method

		// 查找用户的角色
		var authority system.SysAuthority
		err := global.JY_DB.Where("authority_id = ?", authorityId).Preload("SysBaseMenus").First(&authority).Error
		if err != nil {
			common.FailWithMsg(c, "角色不存在")
			c.Abort()
			return
		}

		// 检查是否有权限访问该路径
		hasPermission := checkPermission(&authority, path, method)
		if !hasPermission {
			common.FailWithMsg(c, "没有权限访问该资源")
			c.Abort()
			return
		}

		c.Next()
	}
}

// checkPermission 检查角色是否有权限访问指定路径
func checkPermission(authority *system.SysAuthority, path string, method string) bool {
	// 超级管理员（888）拥有所有权限
	if authority.AuthorityId == "888" {
		return true
	}

	// 检查角色的菜单权限
	for _, menu := range authority.SysBaseMenus {
		// 简单匹配：如果路径包含菜单路径，则认为有权限
		// 实际项目中可以根据需要实现更复杂的匹配逻辑
		if menu.Path != "" && containsPath(path, menu.Path) {
			return true
		}
	}

	return false
}

// containsPath 检查请求路径是否匹配菜单路径
func containsPath(requestPath string, menuPath string) bool {
	// 精确匹配
	if requestPath == menuPath {
		return true
	}
	// 前缀匹配（支持子路径）
	if len(menuPath) > 0 && len(requestPath) >= len(menuPath) {
		if requestPath[:len(menuPath)] == menuPath {
			return true
		}
	}
	return false
}


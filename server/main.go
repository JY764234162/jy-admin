// @title           Gin-Vue-Admin API
// @version         v1.0
// @description     使用gin+vue进行极速开发的全栈开发基础平台
// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name Authorization
// @BasePath /api/
package main

import (
	"jiangyi.com/core"
	"jiangyi.com/global"
)

func main() {
	core.InitViper()
	core.InitBlackCache()
	global.JY_DB = core.InitGorm()
	//初始化数据库
	if global.JY_DB != nil {
		core.RegisterTables()
		// 从数据库加载黑名单到内存缓存
		core.LoadBlacklistFromDB()
		// close db connection logic if needed
		sqlDB, _ := global.JY_DB.DB()
		defer sqlDB.Close()
	}

	//最后启动服务器
	core.InitServer()
}

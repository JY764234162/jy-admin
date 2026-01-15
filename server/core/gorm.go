package core

import (
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/system"
)

func InitGorm() *gorm.DB {
	// 数据库配置
	general := global.JY_Config.Sqlite
	gormConfig := &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			TablePrefix:   general.Prefix,
			SingularTable: general.Singular,
		},
		DisableForeignKeyConstraintWhenMigrating: true,
	}
	fmt.Println(general.Dsn())
	if db, err := gorm.Open(sqlite.Open(general.Dsn()), gormConfig); err != nil {
		fmt.Printf("连接数据库失败: %v\n", err)
		panic(err)
	} else {
		sqlDB, _ := db.DB()
		sqlDB.SetMaxIdleConns(general.MaxIdleConns)
		sqlDB.SetMaxOpenConns(general.MaxOpenConns)
		fmt.Printf("连接数据库成功:%v\n", general.Dsn())
		return db
	}
}

func RegisterTables() {

	db := global.JY_DB
	err := db.AutoMigrate(
		system.SysUser{},
		system.ExaFileUploadAndDownload{},
		business.Customer{},
	)

	if err != nil {
		fmt.Println("注册表失败", err)
	}
	fmt.Println("注册表成功")

}

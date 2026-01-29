package core

import (
	"fmt"
	"os"

	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/system"
)

func InitGorm() *gorm.DB {
	var db *gorm.DB
	var err error
	var dsn string
	var prefix string
	var singular bool
	var maxIdleConns, maxOpenConns int

	// 根据配置选择数据库类型
	dbType := global.JY_Config.System.DBType
	ginMode := os.Getenv("GIN_MODE")

	switch dbType {
	case "mysql":
		mysqlConfig := global.JY_Config.Mysql
		dsn = mysqlConfig.Dsn()
		prefix = mysqlConfig.Prefix
		singular = mysqlConfig.Singular
		maxIdleConns = mysqlConfig.MaxIdleConns
		maxOpenConns = mysqlConfig.MaxOpenConns
		fmt.Printf("使用 MySQL 数据库: %s@%s:%s/%s\n", mysqlConfig.Username, mysqlConfig.Path, mysqlConfig.Port, mysqlConfig.Dbname)
	case "sqlite", "":
		// SQLite 需要 CGO，在 Docker/生产环境（GIN_MODE=release）不支持
		if ginMode == "release" {
			panic("SQLite 在 Docker/生产环境中不可用（需要 CGO），请使用 MySQL。请在配置文件中设置 db-type: mysql")
		}
		// 本地开发环境支持 SQLite
		sqliteConfig := global.JY_Config.Sqlite
		dsn = sqliteConfig.Dsn()
		prefix = sqliteConfig.Prefix
		singular = sqliteConfig.Singular
		maxIdleConns = sqliteConfig.MaxIdleConns
		maxOpenConns = sqliteConfig.MaxOpenConns
		fmt.Printf("使用 SQLite 数据库: %s\n", dsn)
	default:
		panic(fmt.Sprintf("不支持的数据库类型: %s，支持的类型: sqlite, mysql", dbType))
	}

	// GORM 配置
	gormConfig := &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			TablePrefix:   prefix,
			SingularTable: singular,
		},
		DisableForeignKeyConstraintWhenMigrating: true,
	}

	// 连接数据库
	switch dbType {
	case "mysql":
		db, err = gorm.Open(mysql.Open(dsn), gormConfig)
	case "sqlite", "":
		// SQLite 需要 CGO，在 Docker/生产环境（GIN_MODE=release）不支持
		if ginMode == "release" {
			panic("SQLite 在 Docker/生产环境中不可用（需要 CGO），请使用 MySQL")
		}
		// 本地开发环境支持 SQLite
		db, err = gorm.Open(sqlite.Open(dsn), gormConfig)
	default:
		panic(fmt.Sprintf("不支持的数据库类型: %s", dbType))
	}

	if err != nil {
		fmt.Printf("连接数据库失败: %v\n", err)
		panic(err)
	}

	// 设置连接池
	sqlDB, _ := db.DB()
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetMaxOpenConns(maxOpenConns)

	fmt.Printf("连接数据库成功: %s\n", dsn)
	return db
}

func RegisterTables() {

	db := global.JY_DB
	err := db.AutoMigrate(
		system.SysUser{},
		system.ExaFileUploadAndDownload{},
		system.JwtBlacklist{},
		business.Customer{},
		business.AIConversation{},
		business.AIMessage{},
	)

	if err != nil {
		fmt.Println("注册表失败", err)
	}
	fmt.Println("注册表成功")

	// 初始化数据库数据
	if err := InitDb(db); err != nil {
		fmt.Printf("初始化数据库数据失败: %v\n", err)
	}
}

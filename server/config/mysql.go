package config

import (
	"fmt"
)

type Mysql struct {
	GeneralDB `mapstructure:",squash"`
}

// Dsn 生成 MySQL 数据源名称
func (m *Mysql) Dsn() string {
	// 默认端口
	port := m.Port
	if port == "" {
		port = "3306"
	}

	// 默认主机
	host := m.Path
	if host == "" {
		host = "localhost"
	}

	// 构建 DSN
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		m.Username,
		m.Password,
		host,
		port,
		m.Dbname,
	)

	// 添加额外配置
	if m.Config != "" {
		dsn += "&" + m.Config
	}

	return dsn
}

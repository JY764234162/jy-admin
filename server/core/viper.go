package core

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
	"jiangyi.com/global"
)

func InitViper() {
	v := viper.New()

	// 根据 GIN_MODE 环境变量判断环境
	// GIN_MODE 可能的值: debug, release, test
	// release 模式（生产环境）使用 config.docker.yaml
	// debug/test 模式或未设置（开发环境）使用 config.dev.yaml
	ginMode := os.Getenv("GIN_MODE")
	configName := "config.dev"
	env := "dev"

	if ginMode == "release" {
		// 生产环境使用 config.docker.yaml
		configName = "config.docker"
		env = "prod"
	} else {
		// 开发环境使用 config.dev.yaml
		configName = "config.dev"
		env = "dev"
	}

	v.SetConfigName(configName)
	v.SetConfigType("yaml")
	v.AddConfigPath(".")

	// 支持环境变量覆盖配置
	v.AutomaticEnv()
	v.SetEnvPrefix("JY")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	if err := v.ReadInConfig(); err != nil {
		log.Fatalf("Failed to read config file: %v", err)
	}

	v.WatchConfig()
	//只监听配置文件变化，不监听内存中的配置的变化，如果内存中的配置发生变化，则不重新读取配置文件
	v.OnConfigChange(func(e fsnotify.Event) {
		fmt.Println("config file changed:", e.Name)
		if err := v.Unmarshal(&global.JY_Config); err != nil {
			log.Fatalf("Failed to unmarshal config: %v", err)
		}
	})
	if err := v.Unmarshal(&global.JY_Config); err != nil {
		log.Fatalf("Failed to unmarshal config: %v", err)
	}

	// 支持直接从 JWT_SIGNING_KEY 环境变量读取（优先级最高）
	if jwtKey := os.Getenv("JWT_SIGNING_KEY"); jwtKey != "" {
		global.JY_Config.JWT.SigningKey = jwtKey
		fmt.Println("已从环境变量 JWT_SIGNING_KEY 读取 JWT 密钥")
	}

	// 支持从 MYSQL_PASSWORD 环境变量读取 MySQL 密码（优先级最高）
	if mysqlPassword := os.Getenv("MYSQL_PASSWORD"); mysqlPassword != "" {
		global.JY_Config.Mysql.Password = mysqlPassword
		fmt.Println("已从环境变量 MYSQL_PASSWORD 读取 MySQL 密码")
	}

	fmt.Printf("读取配置成功: %s.yaml (GIN_MODE: %s, 环境: %s)\n", configName, ginMode, env)
	global.JY_Viper = v
}

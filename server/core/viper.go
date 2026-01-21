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

	// 获取环境变量，默认为 dev
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "dev"
	}

	// 根据环境加载不同的配置文件
	configName := "config"
	if env != "dev" {
		configName = fmt.Sprintf("config.%s", env)
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

	fmt.Printf("读取配置成功: %s.yaml (环境: %s)\n", configName, env)
	global.JY_Viper = v
}

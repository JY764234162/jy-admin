package core

import (
	"fmt"
	"log"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
	"jiangyi.com/global"
)

func InitViper() {
	v := viper.New()
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	if err := v.ReadInConfig(); err != nil {
		log.Fatalf("Failed to read config file: %v", err)
	}
	v.WatchConfig()
	//只监听config.yaml文件变化，不监听内存中的配置的变化，如果内存中的配置发生变化，则不重新读取配置文件
	v.OnConfigChange(func(e fsnotify.Event) {
		fmt.Println("config file changed:", e.Name)
		if err := v.Unmarshal(&global.JY_Config); err != nil {
			log.Fatalf("Failed to unmarshal config: %v", err)
		}
	})
	if err := v.Unmarshal(&global.JY_Config); err != nil {
		log.Fatalf("Failed to unmarshal config: %v", err)
	}
	fmt.Println("读取配置成功:config.yaml")
	global.JY_Viper = v
}

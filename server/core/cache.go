package core

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/songzhibin97/gkit/cache/local_cache"
	"jiangyi.com/global"
)

// InitBlackCache 初始化本地缓存

func InitBlackCache() {
	// 创建缓存实例
	// 默认过期时间：从配置文件中读取 JWT 过期时间
	dr, err := ParseDuration(global.JY_Config.JWT.ExpiresTime)
	if err != nil {
		panic(err)
	}
	global.JY_BlackCache = local_cache.NewCache(
		local_cache.SetDefaultExpire(dr),
	)
	fmt.Println("本地缓存初始化成功")
}

func ParseDuration(d string) (time.Duration, error) {
	d = strings.TrimSpace(d)
	dr, err := time.ParseDuration(d)
	if err == nil {
		return dr, nil
	}
	if strings.Contains(d, "d") {
		index := strings.Index(d, "d")

		hour, _ := strconv.Atoi(d[:index])
		dr = time.Hour * 24 * time.Duration(hour)
		ndr, err := time.ParseDuration(d[index+1:])
		if err != nil {
			return dr, nil
		}
		return dr + ndr, nil
	}

	dv, err := strconv.ParseInt(d, 10, 64)
	return time.Duration(dv), err
}

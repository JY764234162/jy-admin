package core

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/songzhibin97/gkit/cache/local_cache"
	"jiangyi.com/global"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
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

// LoadBlacklistFromDB 从数据库加载黑名单到内存缓存
func LoadBlacklistFromDB() {
	if global.JY_DB == nil {
		fmt.Println("数据库未初始化，跳过加载黑名单")
		return
	}

	var blacklists []system.JwtBlacklist
	err := global.JY_DB.Find(&blacklists).Error
	if err != nil {
		fmt.Printf("加载黑名单失败: %v\n", err)
		return
	}

	j := utils.NewJWT()
	dr, _ := ParseDuration(global.JY_Config.JWT.ExpiresTime)

	loadedCount := 0
	for _, blacklist := range blacklists {
		// 解析 token 获取过期时间
		var expireTime time.Duration = dr
		claims, err := j.ParseToken(blacklist.Jwt)
		if err == nil && claims != nil && claims.ExpiresAt != nil {
			expireTime = time.Until(claims.ExpiresAt.Time)
			if expireTime < 0 {
				// 如果 token 已过期，跳过
				continue
			}
		}

		// 将 token 加入内存缓存
		global.JY_BlackCache.Set(blacklist.Jwt, struct{}{}, expireTime)
		loadedCount++
	}

	fmt.Printf("从数据库加载黑名单成功，共加载 %d 条记录\n", loadedCount)
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

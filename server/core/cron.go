package core

import (
	"fmt"
	"log"
	"time"

	"jiangyi.com/global"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// CleanExpiredJwtTokens 清理数据库中过期的 JWT token
func CleanExpiredJwtTokens() error {
	if global.JY_DB == nil {
		return fmt.Errorf("数据库未初始化")
	}

	var blacklists []system.JwtBlacklist
	err := global.JY_DB.Find(&blacklists).Error
	if err != nil {
		return fmt.Errorf("查询黑名单失败: %v", err)
	}

	j := utils.NewJWT()
	deletedCount := 0
	now := time.Now()

	for _, blacklist := range blacklists {
		// 解析 token 检查是否过期
		claims, err := j.ParseToken(blacklist.Jwt)
		if err != nil {
			// 如果解析失败（可能是格式错误或已过期），删除该记录
			if err := global.JY_DB.Delete(&blacklist).Error; err != nil {
				log.Printf("删除过期token失败 (ID: %d): %v\n", blacklist.ID, err)
				continue
			}
			deletedCount++
			continue
		}

		// 检查 token 是否已过期
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(now) {
			// token 已过期，删除记录
			if err := global.JY_DB.Delete(&blacklist).Error; err != nil {
				log.Printf("删除过期token失败 (ID: %d): %v\n", blacklist.ID, err)
				continue
			}
			deletedCount++
		}
	}

	if deletedCount > 0 {
		log.Printf("清理过期JWT token完成，共删除 %d 条记录\n", deletedCount)
	} else {
		log.Println("清理过期JWT token完成，没有需要删除的记录")
	}

	return nil
}

// StartJwtCleanupTask 启动 JWT token 清理定时任务
// 每天凌晨执行一次清理任务
func StartJwtCleanupTask() {
	// 计算到下一个凌晨的时间
	now := time.Now()
	nextMidnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Add(24 * time.Hour)
	durationUntilMidnight := nextMidnight.Sub(now)

	// 等待到第一个凌晨
	time.Sleep(durationUntilMidnight)

	// 立即执行一次清理
	log.Println("开始执行JWT token清理任务...")
	if err := CleanExpiredJwtTokens(); err != nil {
		log.Printf("JWT token清理任务执行失败: %v\n", err)
	}

	// 创建定时器，每24小时执行一次
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// 在 goroutine 中运行定时任务
	go func() {
		for range ticker.C {
			log.Println("开始执行JWT token清理任务...")
			if err := CleanExpiredJwtTokens(); err != nil {
				log.Printf("JWT token清理任务执行失败: %v\n", err)
			}
		}
	}()

	log.Println("JWT token清理定时任务已启动，每天凌晨执行一次")
}

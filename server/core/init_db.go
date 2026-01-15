package core

import (
	"fmt"

	"gorm.io/gorm"
	"jiangyi.com/model/business"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

func InitDb(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		// 1. Auto Migrate
		if err := tx.AutoMigrate(
			&system.SysUser{},
			&system.SysAuthority{},
			&system.SysBaseMenu{},
			&system.ExaFileUploadAndDownload{},
			&system.JwtBlacklist{},
			&business.Customer{},
		); err != nil {
			return err
		}

		// 2. Init Data
		var total int64
		if err := tx.Model(&system.SysUser{}).Count(&total).Error; err != nil {
			return err
		}

		if total == 0 {
			// Seed admin user
			user := system.SysUser{
				Username:    "admin",
				Password:    utils.BcryptHash("123456"), // 使用 bcrypt 加密密码
				NickName:    "超级管理员",
				HeaderImg:   "https://qmplusimg.henrongyi.top/gva_header.jpg",
				AuthorityId: "888",
			}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			fmt.Println("InitSysUser success")
		}
		return nil
	})
}

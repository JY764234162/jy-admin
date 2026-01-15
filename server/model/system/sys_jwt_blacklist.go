package system

import "jiangyi.com/global"

type JwtBlacklist struct {
	global.GlobalModel
	Jwt string `gorm:"type:text;comment:jwt"`
}

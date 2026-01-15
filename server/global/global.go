package global

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songzhibin97/gkit/cache/local_cache"
	"github.com/spf13/viper"
	"gorm.io/gorm"
	"jiangyi.com/config"
)

type GlobalModel struct {
	ID        uint           `gorm:"primarykey" json:"ID"` // 主键ID
	CreatedAt time.Time      // 创建时间
	UpdatedAt time.Time      // 更新时间
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"` // 删除时间
}

const (
	// Version 当前版本号
	Version = "v2.8.7"
	// AppName 应用名称
	AppName = "Gin-Vue-Admin"
	// Description 应用描述
	Description = "使用gin+vue进行极速开发的全栈开发基础平台"
)

var (
	JY_DB         *gorm.DB
	JY_Viper      *viper.Viper
	JY_Config     *config.Config
	JY_RouteInfo  gin.RouteInfo
	JY_Lock       sync.RWMutex
	JY_BlackCache local_cache.Cache // 本地缓存，用于黑名单等场景
)

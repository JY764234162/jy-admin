package core

import (
	"fmt"

	"go.uber.org/zap"
	"jiangyi.com/global"
	"jiangyi.com/utils/upload"
)

// InitOSS 初始化OSS存储服务
func InitOSS() {
	ossType := global.JY_Config.System.OSSType
	if ossType == "" {
		ossType = "local"
	}

	var oss upload.OSS
	var err error

	switch ossType {
	case "local":
		global.JY_LOG.Info("文件存储初始化",
			zap.String("type", "本地存储"),
			zap.String("path", global.JY_Config.Local.StorePath),
		)
		fmt.Printf("文件存储初始化: 使用本地存储，路径: %s\n", global.JY_Config.Local.StorePath)
		oss = &upload.Local{}

	case "tencent-cos":
		cosConfig := global.JY_Config.Cos
		global.JY_LOG.Info("文件存储初始化",
			zap.String("type", "腾讯云COS"),
			zap.String("region", cosConfig.Region),
			zap.String("bucket", cosConfig.Bucket),
			zap.String("path-prefix", cosConfig.PathPrefix),
		)
		fmt.Printf("文件存储初始化: 使用腾讯云COS，地域: %s，存储桶: %s，路径前缀: %s\n",
			cosConfig.Region, cosConfig.Bucket, cosConfig.PathPrefix)

		oss, err = upload.NewTencentCOS()
		if err != nil {
			global.JY_LOG.Error("COS初始化失败", zap.Error(err))
			panic("COS初始化失败: " + err.Error())
		}
		fmt.Println("COS客户端初始化成功")

	default:
		global.JY_LOG.Info("文件存储初始化",
			zap.String("type", "本地存储（默认）"),
			zap.String("path", global.JY_Config.Local.StorePath),
		)
		fmt.Printf("文件存储初始化: 使用本地存储（默认），路径: %s\n", global.JY_Config.Local.StorePath)
		oss = &upload.Local{}
	}

	global.JY_OSS = oss
	fmt.Println("OSS存储服务初始化完成")
}

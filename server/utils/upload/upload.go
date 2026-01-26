package upload

import (
	"mime/multipart"

	"jiangyi.com/global"
)

type OSS interface {
	UploadFile(file *multipart.FileHeader) (string, string, error)
	DeleteFile(key string) error
}

// NewOss 获取全局OSS实例（已废弃，建议使用 global.JY_OSS）
// 为了向后兼容，保留此函数，但返回全局实例
func NewOss() OSS {
	if global.JY_OSS == nil {
		// 如果全局实例未初始化，返回本地存储作为降级方案
		global.JY_LOG.Warn("OSS未初始化，使用本地存储作为降级方案")
		return &Local{}
	}
	// 返回全局OSS实例
	return global.JY_OSS.(OSS)
}

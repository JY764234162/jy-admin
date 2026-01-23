package upload

import (
	"mime/multipart"

	"go.uber.org/zap"
	"jiangyi.com/global"
)

type OSS interface {
	UploadFile(file *multipart.FileHeader) (string, string, error)
	DeleteFile(key string) error
}

func NewOss() OSS {
	switch global.JY_Config.System.OSSType {
	case "local":
		return &Local{}
	case "tencent-cos":
		cosClient, err := NewTencentCOS()
		if err != nil {
			global.JY_LOG.Error("COS初始化失败", zap.Error(err))
			panic("COS初始化失败: " + err.Error()) // 如果配置了COS但初始化失败，应该panic，避免使用错误的存储
		}
		return cosClient
	// case "qiniu":
	// 	return &Qiniu{}
	// case "aliyun-oss":
	// 	return &AliyunOSS{}
	// case "huawei-obs":
	// 	return HuaWeiObs
	// case "aws-s3":
	// 	return &AwsS3{}
	// case "cloudflare-r2":
	// 	return &CloudflareR2{}
	// case "minio":
	// 	minioClient, err := GetMinio(global.GVA_CONFIG.Minio.Endpoint, global.GVA_CONFIG.Minio.AccessKeyId, global.GVA_CONFIG.Minio.AccessKeySecret, global.GVA_CONFIG.Minio.BucketName, global.GVA_CONFIG.Minio.UseSSL)
	// 	if err != nil {
	// 		global.GVA_LOG.Warn("你配置了使用minio，但是初始化失败，请检查minio可用性或安全配置: " + err.Error())
	// 		panic("minio初始化失败") // 建议这样做，用户自己配置了minio，如果报错了还要把服务开起来，使用起来也很危险
	// 	}
	// 	return minioClient
	default:
		return &Local{}
	}
}

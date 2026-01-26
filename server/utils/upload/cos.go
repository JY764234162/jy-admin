package upload

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"net/http"
	"net/url"

	"github.com/tencentyun/cos-go-sdk-v5"
	"jiangyi.com/global"
	"jiangyi.com/utils"
)

type TencentCOS struct {
	client *cos.Client
}

// NewTencentCOS 创建腾讯云COS客户端
func NewTencentCOS() (*TencentCOS, error) {
	cosConfig := global.JY_Config.Cos

	// 验证必要配置
	if cosConfig.SecretId == "" || cosConfig.SecretKey == "" {
		return nil, errors.New("COS配置不完整：SecretId和SecretKey不能为空")
	}
	if cosConfig.Bucket == "" || cosConfig.Region == "" {
		return nil, errors.New("COS配置不完整：Bucket和Region不能为空")
	}

	// 构建COS服务URL
	u, err := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", cosConfig.Bucket, cosConfig.Region))
	if err != nil {
		return nil, fmt.Errorf("构建COS URL失败: %v", err)
	}

	// 创建COS客户端
	baseURL := &cos.BaseURL{BucketURL: u}
	client := cos.NewClient(baseURL, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  cosConfig.SecretId,
			SecretKey: cosConfig.SecretKey,
		},
	})

	fmt.Printf("COS客户端创建成功: 地域=%s, 存储桶=%s, URL=%s\n",
		cosConfig.Region, cosConfig.Bucket, u.String())

	return &TencentCOS{
		client: client,
	}, nil
}

// UploadFile 上传文件到COS
func (t *TencentCOS) UploadFile(file *multipart.FileHeader) (string, string, error) {
	// 读取文件后缀
	ext := filepath.Ext(file.Filename)
	// 读取文件名并加密
	name := strings.TrimSuffix(file.Filename, ext)
	name = utils.MD5V([]byte(name))
	// 拼接新文件名
	filename := name + "_" + time.Now().Format("20060102150405") + ext

	// 构建COS对象键（路径）
	cosConfig := global.JY_Config.Cos
	objectKey := filename
	if cosConfig.PathPrefix != "" {
		// 确保路径前缀以/开头，不以/结尾
		prefix := strings.Trim(cosConfig.PathPrefix, "/")
		if prefix != "" {
			objectKey = prefix + "/" + filename
		}
	}

	// 打开文件
	f, err := file.Open()
	if err != nil {
		return "", "", fmt.Errorf("打开文件失败: %v", err)
	}
	defer f.Close()

	// 上传文件到COS
	ctx := context.Background()
	_, err = t.client.Object.Put(ctx, objectKey, f, nil)
	if err != nil {
		return "", "", fmt.Errorf("上传文件到COS失败: %v", err)
	}

	// 构建文件访问URL
	fileURL := t.buildFileURL(objectKey)

	return fileURL, filename, nil
}

// DeleteFile 从COS删除文件
func (t *TencentCOS) DeleteFile(key string) error {
	if key == "" {
		return errors.New("key不能为空")
	}

	// 验证key是否包含非法字符
	if strings.Contains(key, "..") || strings.ContainsAny(key, `\/:*?"<>|`) {
		return errors.New("非法的key")
	}

	// 构建COS对象键
	cosConfig := global.JY_Config.Cos
	objectKey := key
	if cosConfig.PathPrefix != "" {
		prefix := strings.Trim(cosConfig.PathPrefix, "/")
		if prefix != "" {
			objectKey = prefix + "/" + key
		}
	}

	// 删除文件
	ctx := context.Background()
	_, err := t.client.Object.Delete(ctx, objectKey)
	if err != nil {
		return fmt.Errorf("从COS删除文件失败: %v", err)
	}

	return nil
}

// buildFileURL 构建文件访问URL
func (t *TencentCOS) buildFileURL(objectKey string) string {
	cosConfig := global.JY_Config.Cos

	// 如果配置了自定义域名，优先使用
	if cosConfig.Domain != "" {
		domain := strings.TrimRight(cosConfig.Domain, "/")
		scheme := "https"
		if !cosConfig.UseHTTPS {
			scheme = "http"
		}
		return fmt.Sprintf("%s://%s/%s", scheme, domain, objectKey)
	}

	// 否则使用COS默认域名
	scheme := "https"
	if !cosConfig.UseHTTPS {
		scheme = "http"
	}

	// 如果使用CDN加速域名
	if cosConfig.UseCDN {
		// CDN域名格式：{bucket}.file.myqcloud.com
		return fmt.Sprintf("%s://%s.file.myqcloud.com/%s", scheme, cosConfig.Bucket, objectKey)
	}

	// 标准COS域名格式：{bucket}.cos.{region}.myqcloud.com
	return fmt.Sprintf("%s://%s.cos.%s.myqcloud.com/%s", scheme, cosConfig.Bucket, cosConfig.Region, objectKey)
}

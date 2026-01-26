package upload

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils/upload"
)

// UploadFile 上传文件
// @Summary      上传文件
// @Description  上传文件
// @Security     ApiKeyAuth
// @Tags         File
// @Accept       multipart/form-data
// @Produce      json
// @Param        file     formData  file  true   "文件"
// @Param        classId  formData  int   false  "分类ID"
// @Success      200      {object}  common.Response{data=system.ExaFileUploadAndDownload,msg=string}  "上传成功"
// @Router       /upload [post]
func (u *Api) UploadFile(c *gin.Context) {
	var file system.ExaFileUploadAndDownload
	_, header, err := c.Request.FormFile("file")
	classId, _ := strconv.Atoi(c.DefaultPostForm("classId", "0"))
	if err != nil {
		common.FailWithMsg(c, "未接收到文件")
		return
	}
	// 使用全局OSS实例
	if global.JY_OSS == nil {
		global.JY_LOG.Error("OSS未初始化")
		common.FailWithMsg(c, "文件存储服务未初始化")
		return
	}

	oss, ok := global.JY_OSS.(upload.OSS)
	if !ok {
		global.JY_LOG.Error("OSS类型转换失败", zap.Any("type", fmt.Sprintf("%T", global.JY_OSS)))
		common.FailWithMsg(c, "文件存储服务类型错误")
		return
	}

	filePath, key, uploadErr := oss.UploadFile(header)

	if uploadErr != nil {
		global.JY_LOG.Error("文件上传失败",
			zap.String("filename", header.Filename),
			zap.String("oss_type", global.JY_Config.System.OSSType),
			zap.Error(uploadErr),
		)
		common.FailWithError(c, "写入oss文件失败", uploadErr)
		return
	}
	s := strings.Split(header.Filename, ".")
	file = system.ExaFileUploadAndDownload{
		Url:     filePath,
		Name:    header.Filename,
		ClassId: classId,
		Tag:     s[len(s)-1],
		Key:     key,
	}

	// 检查是否已存在相同key的记录
	var existingFile system.ExaFileUploadAndDownload
	err = global.JY_DB.Where(&system.ExaFileUploadAndDownload{Key: key}).First(&existingFile).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = global.JY_DB.Create(&file).Error
		if err != nil {
			common.FailWithMsg(c, "写入数据库失败")
			return
		}
	} else {
		common.FailWithMsg(c, "文件已存在")
		return
	}

	common.OkWithDetailed(c, file, "上传成功")
}

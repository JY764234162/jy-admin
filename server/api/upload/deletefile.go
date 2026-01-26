package upload

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils/upload"
)

// DeleteFile 删除文件
// @Summary      删除文件
// @Description  删除文件
// @Security     ApiKeyAuth
// @Tags         File
// @Accept       json
// @Produce      json
// @Param        data  body      system.ExaFileUploadAndDownload  true  "文件Key"
// @Success      200   {object}  common.Response{msg=string}  "删除成功"
// @Router       /upload [delete]
func (u *Api) DeleteFile(c *gin.Context) {
	var file system.ExaFileUploadAndDownload
	if err := c.ShouldBindJSON(&file); err != nil {
		common.FailWithMsg(c, "绑定失败")
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

	if err := global.JY_DB.Where("key = ?", file.Key).First(&file).Error; err != nil {
		common.FailWithMsg(c, "文件不存在，删除失败")
		return
	}
	if err := oss.DeleteFile(file.Key); err != nil {
		global.JY_LOG.Error("文件删除失败",
			zap.String("key", file.Key),
			zap.String("oss_type", global.JY_Config.System.OSSType),
			zap.Error(err),
		)
		common.FailWithError(c, "删除文件失败", err)
		return
	}

	if err := global.JY_DB.Delete(&file).Error; err != nil {
		common.FailWithMsg(c, "数据库内删除失败")
		return
	}

	common.OkWithMsg(c, "删除成功")
}

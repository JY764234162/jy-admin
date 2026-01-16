package upload

import (
	"github.com/gin-gonic/gin"
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

	oss := upload.NewOss()
	if err := global.JY_DB.Where("key = ?", file.Key).First(&file).Error; err != nil {
		common.FailWithMsg(c, "文件不存在，删除失败")
		return
	}
	if err := oss.DeleteFile(file.Key); err != nil {
		common.FailWithMsg(c, "删除文件失败")
		return
	}

	if err := global.JY_DB.Delete(&file).Error; err != nil {
		common.FailWithMsg(c, "数据库内删除失败")
		return
	}

	common.OkWithMsg(c, "删除成功")
}

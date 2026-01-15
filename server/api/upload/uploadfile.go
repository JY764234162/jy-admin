package upload

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"jiangyi.com/global"
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
		c.JSON(200, gin.H{
			"code": 404,
			"msg":  "未接收到文件",
		})
		return
	}
	oss := upload.NewOss()
	filePath, key, uploadErr := oss.UploadFile(header)
	if uploadErr != nil {
		c.JSON(200, gin.H{
			"code": 404,
			"msg":  "写入oss文件失败",
		})
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
			c.JSON(200, gin.H{
				"code": 404,
				"msg":  "写入数据库失败",
			})
			return
		}
	} else {
		c.JSON(200, gin.H{
			"code": 404,
			"msg":  "文件已存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": http.StatusOK,
		"data": file,
		"msg":  "上传成功",
	})
}

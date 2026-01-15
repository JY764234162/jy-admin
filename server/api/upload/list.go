package upload

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

type FileListRequest struct {
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
	Keyword  string `json:"keyword"`
}

// GetFileList 获取文件列表
// @Summary      分页获取文件列表
// @Description  分页获取文件列表
// @Security     ApiKeyAuth
// @Tags         File
// @Accept       json
// @Produce      json
// @Param        data  query     FileListRequest  true  "页码, 每页大小, 关键字"
// @Success      200   {object}  common.Response{data=common.PageResult,msg=string}  "查询成功"
// @Router       /upload/list [get]
func (u *Api) GetFileList(c *gin.Context) {
	var params FileListRequest
	var err error
	if err = c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "绑定失败",
		})
		return
	}
	// 设置默认值
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 10
	}
	var files []system.ExaFileUploadAndDownload
	var count int64
	err = global.JY_DB.Model(&system.ExaFileUploadAndDownload{}).Where("name LIKE ?", "%"+params.Keyword+"%").Count(&count).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "查询失败",
		})
		return
	}

	if err = global.JY_DB.Find(&files).Limit(params.PageSize).Offset((params.Page - 1) * params.PageSize).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "查询失败",
		})
		return
	}

	c.JSON(http.StatusOK, common.Response{
		Code: http.StatusOK,
		Data: common.PageResult{
			List:     files,
			Total:    count,
			Page:     params.Page,
			PageSize: params.PageSize,
		},
		Msg: "查询成功",
	})
}

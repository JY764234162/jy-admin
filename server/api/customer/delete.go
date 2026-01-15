package customer

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
)

type DeleteCustomerRequest struct {
	ID uint `json:"id" binding:"required"`
}

// DeleteCustomer 删除客户
// @Summary      删除客户
// @Description  删除客户
// @Security     ApiKeyAuth
// @Tags         Customer
// @Accept       json
// @Produce      json
// @Param        data  body      DeleteCustomerRequest  true  "客户ID"
// @Success      200   {object}  common.Response{msg=string}  "删除成功"
// @Router       /customer [delete]
func (c *Api) DeleteCustomer(ctx *gin.Context) {
	var req DeleteCustomerRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "绑定失败",
		})
		return
	}

	var customer business.Customer
	// 先查询客户是否存在
	if err := global.JY_DB.First(&customer, req.ID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			ctx.JSON(http.StatusOK, gin.H{
				"code": 404,
				"data": nil,
				"msg":  "客户不存在，删除失败",
			})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "查询失败",
		})
		return
	}

	// 删除客户（软删除）
	if err := global.JY_DB.Delete(&customer).Error; err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "删除失败",
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": http.StatusOK,
		"data": nil,
		"msg":  "删除成功",
	})
}

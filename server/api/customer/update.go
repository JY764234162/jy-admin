package customer

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
)

type UpdateCustomerRequest struct {
	ID             uint   `json:"id" binding:"required"`
	CustomerName   string `json:"customerName"`
	CustomerPhone  string `json:"customerPhone"`
	CustomerStatus string `json:"customerStatus"`
}

// UpdateCustomer 更新客户
// @Summary      更新客户
// @Description  更新客户
// @Security     ApiKeyAuth
// @Tags         Customer
// @Accept       json
// @Produce      json
// @Param        data  body      UpdateCustomerRequest  true  "客户ID, 客户姓名, 客户电话"
// @Success      200   {object}  common.Response{data=business.Customer,msg=string}  "更新成功"
// @Router       /customer [put]
func (c *Api) UpdateCustomer(ctx *gin.Context) {
	var req UpdateCustomerRequest
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
				"msg":  "客户不存在",
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

	// 更新字段
	updateData := make(map[string]interface{})
	if req.CustomerName != "" {
		updateData["customer_name"] = req.CustomerName
	}
	if req.CustomerPhone != "" {
		updateData["customer_phone"] = req.CustomerPhone
	}
	if req.CustomerStatus != "" {
		updateData["customer_status"] = req.CustomerStatus
	}

	if err := global.JY_DB.Model(&customer).Updates(updateData).Error; err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"code": 404,
			"data": nil,
			"msg":  "更新失败",
		})
		return
	}

	// 重新查询更新后的数据
	global.JY_DB.First(&customer, req.ID)

	ctx.JSON(http.StatusOK, gin.H{
		"code": http.StatusOK,
		"data": customer,
		"msg":  "更新成功",
	})
}

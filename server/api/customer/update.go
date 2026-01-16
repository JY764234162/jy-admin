package customer

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
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
		common.FailWithMsg(ctx, "绑定失败")
		return
	}

	var customer business.Customer
	// 先查询客户是否存在
	if err := global.JY_DB.First(&customer, req.ID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			common.FailWithMsg(ctx, "客户不存在")
			return
		}
		common.FailWithMsg(ctx, "查询失败")
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
		common.FailWithMsg(ctx, "更新失败")
		return
	}

	// 重新查询更新后的数据
	global.JY_DB.First(&customer, req.ID)

	common.OkWithDetailed(ctx, customer, "更新成功")
}

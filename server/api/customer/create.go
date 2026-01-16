package customer

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
)

type CreateCustomerRequest struct {
	CustomerName   string `json:"customerName" binding:"required"`
	CustomerPhone  string `json:"customerPhone" binding:"required"`
	CustomerStatus string `json:"customerStatus"`
}

// CreateCustomer 创建客户
// @Summary      创建客户
// @Description  创建客户
// @Security     ApiKeyAuth
// @Tags         Customer
// @Accept       json
// @Produce      json
// @Param        data  body      CreateCustomerRequest  true  "客户姓名, 客户电话"
// @Success      200   {object}  common.Response{data=business.Customer,msg=string}  "创建成功"
// @Router       /customer [post]
func (c *Api) CreateCustomer(ctx *gin.Context) {
	var req CreateCustomerRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		common.FailWithMsg(ctx, "绑定失败")
		return
	}

	customer := business.Customer{
		CustomerName:   req.CustomerName,
		CustomerPhone:  req.CustomerPhone,
		CustomerStatus: req.CustomerStatus,
	}

	if err := global.JY_DB.Create(&customer).Error; err != nil {
		common.FailWithMsg(ctx, "创建失败")
		return
	}

	common.OkWithDetailed(ctx, customer, "创建成功")
}

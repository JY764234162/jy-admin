package customer

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/business"
	"jiangyi.com/model/common"
)

type CustomerListRequest struct {
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
	Keyword  string `json:"keyword"`
}

// GetCustomerList 获取客户列表
// @Summary      分页获取客户列表
// @Description  分页获取客户列表
// @Security     ApiKeyAuth
// @Tags         Customer
// @Accept       json
// @Produce      json
// @Param        data  query     CustomerListRequest    true  "页码, 每页大小, 关键字"
// @Success      200   {object}  common.Response{data=common.PageResult,msg=string}  "查询成功"
// @Router       /customer/list [get]
func (c *Api) GetCustomerList(ctx *gin.Context) {
	var params CustomerListRequest
	var err error
	if err = ctx.ShouldBindQuery(&params); err != nil {
		common.FailWithMsg(ctx, "绑定失败")
		return
	}

	// 设置默认值
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 10
	}

	var customers []business.Customer
	var count int64

	// 构建查询条件
	query := global.JY_DB.Model(&business.Customer{})
	if params.Keyword != "" {
		query = query.Where("customer_name LIKE ? OR customer_phone LIKE ?", "%"+params.Keyword+"%", "%"+params.Keyword+"%")
	}

	// 统计总数
	err = query.Count(&count).Error
	if err != nil {
		common.FailWithMsg(ctx, "查询失败")
		return
	}

	// 分页查询
	if err = query.Limit(params.PageSize).Offset((params.Page - 1) * params.PageSize).Find(&customers).Error; err != nil {
		common.FailWithMsg(ctx, "查询失败")
		return
	}

	common.OkWithDetailed(ctx, common.PageResult{
		List:     customers,
		Total:    count,
		Page:     params.Page,
		PageSize: params.PageSize,
	}, "查询成功")
}

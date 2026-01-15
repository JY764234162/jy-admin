package business

import (
	"gorm.io/gorm"
)

type Customer struct {
	gorm.Model
	CustomerName   string `json:"customerName" gorm:"comment:客户名"`
	CustomerPhone  string `json:"customerPhone" gorm:"comment:客户手机号"`
	CustomerStatus string `json:"customerStatus" gorm:"comment:客户状态"`
}

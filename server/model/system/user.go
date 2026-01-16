package system

import (
	"time"

	"gorm.io/gorm"
)

type SysUser struct {
	ID          uint           `gorm:"primarykey" json:"ID"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
	Username    string         `json:"username" gorm:"index;comment:用户登录名"`
	Password    string         `json:"-" gorm:"comment:用户登录密码"`
	NickName    string         `json:"nickName" gorm:"default:系统用户;comment:用户昵称;unique;not null"`
	HeaderImg   string         `json:"headerImg" gorm:"default:https://qmplusimg.henrongyi.top/gva_header.jpg;comment:用户头像"`
	AuthorityId string         `json:"authorityId" gorm:"default:888;comment:用户角色ID"`
}

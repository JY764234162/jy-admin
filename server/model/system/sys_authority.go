package system

import (
	"time"

	"gorm.io/gorm"
)

type SysAuthority struct {
	ID            uint           `gorm:"primarykey" json:"ID"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	AuthorityId   string         `json:"authorityId" gorm:"not null;unique;primary_key;comment:角色ID"` // 角色ID
	AuthorityName string         `json:"authorityName" gorm:"comment:角色名"`                            // 角色名
	ParentId      string         `json:"parentId" gorm:"comment:父角色ID"`                               // 父角色ID
	DataAuthority []SysAuthority `json:"dataAuthority" gorm:"many2many:sys_data_authority_id;"`
	Children      []SysAuthority `json:"children" gorm:"-"`
	SysBaseMenus  []SysBaseMenu  `json:"menus" gorm:"many2many:sys_authority_menus;"`
	DefaultRouter string         `json:"defaultRouter" gorm:"comment:默认路由;default:dashboard"` // 默认路由
	Enable        bool           `json:"enable" gorm:"default:1;comment:角色状态，1-启用，0-禁用"`      // 角色状态
}

type SysBaseMenu struct {
	gorm.Model
	MenuLevel uint                                       `json:"-"`
	ParentId  string                                     `json:"parentId" gorm:"comment:父菜单ID"`                  // 父菜单ID
	Path      string                                     `json:"path" gorm:"comment:路由path"`                     // 路由path
	Name      string                                     `json:"name" gorm:"comment:路由name"`                     // 路由name
	Hidden    bool                                       `json:"hidden" gorm:"comment:是否在列表隐藏"`                  // 是否在列表隐藏
	Component string                                     `json:"component" gorm:"comment:对应前端文件路径"`              // 对应前端文件路径
	Sort      int                                        `json:"sort" gorm:"comment:排序标记"`                       // 排序标记
	Enable    bool                                       `json:"enable" gorm:"default:1;comment:菜单状态，1-启用，0-禁用"` // 菜单状态
	Meta      `json:"meta" gorm:"embedded;comment:附加属性"` // 附加属性
}

type Meta struct {
	Title       string `json:"title" gorm:"comment:菜单名"`           // 菜单名
	Icon        string `json:"icon" gorm:"comment:菜单图标"`           // 菜单图标
	CloseTab    bool   `json:"closeTab" gorm:"comment:自动关闭tab"`    // 自动关闭tab
	KeepAlive   bool   `json:"keepAlive" gorm:"comment:是否缓存"`      // 是否缓存
	DefaultMenu bool   `json:"defaultMenu" gorm:"comment:是否是基础路由"` // 是否是基础路由
}

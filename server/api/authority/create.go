package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// CreateAuthority 创建角色
// @Summary      创建角色
// @Description  创建角色
// @Security     ApiKeyAuth
// @Tags         Authority
// @Accept       json
// @Produce      json
// @Param        data  body      system.SysAuthority  true  "角色ID, 角色名, 父角色ID"
// @Success      200   {object}  common.Response{msg=string}  "创建成功"
// @Router       /authority [post]
func (a *Api) CreateAuthority(c *gin.Context) {
	var auth system.SysAuthority
	err := c.ShouldBindJSON(&auth)
	if err != nil {
		common.FailWithMsg(c, "参数绑定失败")
		return
	}
	err = global.JY_DB.Create(&auth).Error
	if err != nil {
		common.FailWithMsg(c, "创建角色失败")
		return
	}
	common.OkWithMsg(c, "创建成功")
}

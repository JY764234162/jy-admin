package authority

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// GetAuthorityList 获取角色列表
// @Summary      获取角色列表
// @Description  获取角色列表
// @Security     ApiKeyAuth
// @Tags         Authority
// @Produce      json
// @Success      200  {object}  common.Response{data=[]system.SysAuthority,msg=string}  "获取成功"
// @Router       /authority/list [get]
func (a *Api) GetAuthorityList(c *gin.Context) {
	var auths []system.SysAuthority
	err := global.JY_DB.Find(&auths).Error
	if err != nil {
		common.FailWithMsg(c, "获取列表失败")
		return
	}
	common.OkWithData(c, auths)
}

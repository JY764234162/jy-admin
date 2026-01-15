package user

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// DeleteUser 删除用户
// @Summary      删除用户
// @Description  删除用户
// @Security     ApiKeyAuth
// @Tags         User
// @Accept       json
// @Produce      json
// @Param        id   path      int              true  "用户ID"
// @Success      200  {object}  common.Response{msg=string}  "删除成功"
// @Router       /user/{id} [delete]
func (a *Api) DeleteUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	err := global.JY_DB.Delete(&system.SysUser{}, id).Error
	if err != nil {
		common.FailWithMsg(c, "删除用户失败")
		return
	}
	common.OkWithMsg(c, "删除成功")
}

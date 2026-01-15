package login

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
)

// Logout 登出接口
// @Summary      登出
// @Description  登出
// @Tags         Login
// @Accept       json
// @Produce      json
// @Success      200  {object}  common.Response{msg=string}  "登出"
// @Router       /login/logout [post]
func (l *Api) Logout(ctx *gin.Context) {
	authorization := ctx.Request.Header.Get("Authorization")

	jwt := &system.JwtBlacklist{
		Jwt: authorization,
	}
	err := global.JY_DB.Create(jwt).Error
	if err != nil {
		common.OkWithMsg(ctx, "jwt作废失败")
	}
	global.JY_BlackCache.SetDefault(authorization, struct{}{})
	common.OkWithMsg(ctx, "jwt作废成功")
}

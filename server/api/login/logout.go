package login

import (
	"time"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

// Logout 登出接口
// @Summary      登出
// @Description  登出，将 token 加入黑名单
// @Security     ApiKeyAuth
// @Tags         Login
// @Accept       json
// @Produce      json
// @Success      200  {object}  common.Response{msg=string}  "登出成功"
// @Router       /login/logout [post]
func (l *Api) Logout(ctx *gin.Context) {
	authorization := ctx.Request.Header.Get("Authorization")
	if authorization == "" {
		common.FailWithMsg(ctx, "未提供 token")
		return
	}

	// 解析 token 获取过期时间，用于设置缓存的过期时间
	var expireTime time.Duration
	j := utils.NewJWT()
	claims, err := j.ParseToken(authorization)
	if err == nil && claims != nil {
		// 如果 token 有效，计算剩余过期时间
		if claims.ExpiresAt != nil {
			expireTime = time.Until(claims.ExpiresAt.Time)
			if expireTime < 0 {
				expireTime = 0
			}
		}
	}

	// 如果无法解析 token 或已过期，使用默认过期时间
	if expireTime == 0 {
		dr, err := utils.ParseDuration(global.JY_Config.JWT.ExpiresTime)
		if err != nil {
			expireTime = 24 * time.Hour // 默认 24 小时
		} else {
			expireTime = dr
		}
	}

	// 先检查数据库中是否已存在
	var existingBlacklist system.JwtBlacklist
	err = global.JY_DB.Where("jwt = ?", authorization).First(&existingBlacklist).Error
	if err != nil {
		// 如果不存在，则创建新记录
		jwt := &system.JwtBlacklist{
			Jwt: authorization,
		}
		err = global.JY_DB.Create(jwt).Error
		if err != nil {
			common.FailWithMsg(ctx, "jwt作废失败: "+err.Error())
			return
		}
	}

	// 将 token 加入内存缓存，设置过期时间
	global.JY_BlackCache.Set(authorization, struct{}{}, expireTime)

	common.OkWithMsg(ctx, "登出成功")
}

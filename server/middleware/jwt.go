package middleware

import (
	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/utils"
)

func JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 我们这里jwt鉴权取头部信息 Authorization 登录时回返回token信息 这里前端需要把token存储到cookie或者本地localStorage中 不过需要跟后端协商过期时间 可以约定刷新令牌或者重新登录
		authorization := c.Request.Header.Get("Authorization")
		if authorization == "" {
			common.FailWithMsg(c, "未登录或非法访问，请登录")
			c.Abort()
			return
		}
		if _, ok := global.JY_BlackCache.Get(authorization); ok {
			common.FailWithMsg(c, "token已作废，请重新登录")
			c.Abort()
			return
		}

		j := utils.NewJWT()
		// parseToken 解析token包含的信息
		claims, err := j.ParseToken(authorization)
		if err != nil {
			common.FailWithMsg(c, err.Error())
			c.Abort()
			return
		}
		c.Set("claims", claims)
		c.Next()
	}
}

package login

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

var store = base64Captcha.DefaultMemStore

type Api struct {
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Code     string `json:"code"`
	CodeId   string `json:"code_id"`
}

// Login 登录接口
// @Summary      用户登录
// @Description  用户登录
// @Tags         Login
// @Accept       json
// @Produce      json
// @Param        data  body      LoginRequest                                                true  "用户名, 密码, 验证码"
// @Success      200   {object}  common.Response{data=map[string]interface{},msg=string}  "登录成功"
// @Router       /login [post]
func (l *Api) Login(ctx *gin.Context) {
	var params LoginRequest
	var err error
	err = ctx.ShouldBindJSON(&params)
	if err != nil {
		common.FailWithMsg(ctx, "获取参数失败")
		return
	}
	if params.Username == "" || params.Password == "" {
		common.FailWithMsg(ctx, "用户名或密码不能为空")
		return
	}

	key := ctx.ClientIP()
	// 判断验证码是否开启
	openCaptcha := global.JY_Config.Captcha.OpenCaptcha               // 是否开启防爆次数
	openCaptchaTimeOut := global.JY_Config.Captcha.OpenCaptchaTimeout // 缓存超时时间
	//获取这个ip的次数
	v, ok := global.JY_BlackCache.Get(key)
	if !ok {
		global.JY_BlackCache.Set(key, 1, time.Second*time.Duration(openCaptchaTimeOut))
	}
	//是否开启校验验证码
	var oc bool = openCaptcha == 0 || openCaptcha < interfaceToInt(v)
	if oc && (params.Code == "" || params.CodeId == "" || !store.Verify(params.CodeId, params.Code, true)) {
		// 验证码次数+1
		global.JY_BlackCache.Increment(key, 1)
		common.FailWithMsg(ctx, "验证码错误")
		return
	}

	var user system.SysUser
	err = global.JY_DB.Where("username = ? AND password = ?", params.Username, params.Password).
		First(&user).Error
	if err != nil {
		global.JY_BlackCache.Increment(key, 1)
		common.FailWithMsg(ctx, "用户不存在或密码错误")
		return
	}

	// 生成Token
	j := utils.NewJWT()
	claims := utils.CreateClaims(utils.CustomClaims{
		ID:          user.ID,
		Username:    user.Username,
		NickName:    user.NickName,
		AuthorityId: user.AuthorityId,
	})
	token, err := j.CreateToken(claims)
	if err != nil {
		common.FailWithMsg(ctx, "获取token失败")
		return
	}

	common.OkWithDetailed(ctx, gin.H{
		"user":      user,
		"token":     token,
		"expiresAt": claims.RegisteredClaims.ExpiresAt.Unix() * 1000,
	}, "登录成功")
}

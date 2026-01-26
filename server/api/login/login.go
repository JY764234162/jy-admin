package login

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
	"go.uber.org/zap"
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
		common.FailWithError(ctx, "获取参数失败", err)
		return
	}
	if params.Username == "" || params.Password == "" {
		common.FailWithMsg(ctx, "用户名或密码不能为空")
		return
	}

	key := ctx.ClientIP()

	// 记录登录尝试
	global.JY_LOG.Info("登录尝试",
		zap.String("username", params.Username),
		zap.String("ip", key),
		zap.String("user-agent", ctx.Request.UserAgent()),
	)
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
		global.JY_LOG.Warn("登录失败：验证码错误",
			zap.String("username", params.Username),
			zap.String("ip", key),
			zap.Bool("has_code", params.Code != ""),
			zap.Bool("has_code_id", params.CodeId != ""),
		)
		common.FailWithMsg(ctx, "验证码错误")
		return
	}

	// 查找用户
	var user system.SysUser
	err = global.JY_DB.Where("username = ?", params.Username).First(&user).Error
	if err != nil {
		global.JY_BlackCache.Increment(key, 1)
		global.JY_LOG.Warn("登录失败：用户不存在",
			zap.String("username", params.Username),
			zap.String("ip", key),
			zap.Error(err),
		)
		common.FailWithError(ctx, "用户不存在或密码错误", err)
		return
	}

	// 使用 bcrypt 验证密码
	if !utils.BcryptCheck(params.Password, user.Password) {
		global.JY_BlackCache.Increment(key, 1)
		global.JY_LOG.Warn("登录失败：密码错误",
			zap.String("username", params.Username),
			zap.String("ip", key),
			zap.Uint("user_id", user.ID),
		)
		common.FailWithMsg(ctx, "用户不存在或密码错误")
		return
	}

	// 检查用户状态（只有用户被禁用时才不允许登录）
	if !user.Enable {
		global.JY_BlackCache.Increment(key, 1)
		global.JY_LOG.Warn("登录失败：用户已被禁用",
			zap.String("username", params.Username),
			zap.String("ip", key),
			zap.Uint("user_id", user.ID),
		)
		common.FailWithMsg(ctx, "用户已被禁用，无法登录")
		return
	}

	// 注意：角色禁用不影响登录，只影响菜单权限
	// 角色禁用时，用户仍可登录，但获取菜单时会返回空菜单（在 getMenusByAuthorityId 中处理）

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
		global.JY_LOG.Error("登录失败：Token生成失败",
			zap.String("username", params.Username),
			zap.String("ip", key),
			zap.Uint("user_id", user.ID),
			zap.Error(err),
		)
		common.FailWithError(ctx, "获取token失败", err)
		return
	}

	// 记录登录成功
	global.JY_LOG.Info("登录成功",
		zap.String("username", params.Username),
		zap.String("ip", key),
		zap.Uint("user_id", user.ID),
		zap.String("authority_id", user.AuthorityId),
		zap.String("nick_name", user.NickName),
	)

	common.OkWithDetailed(ctx, gin.H{
		"user":      user,
		"token":     token,
		"expiresAt": claims.RegisteredClaims.ExpiresAt.Unix() * 1000,
	}, "登录成功")
}

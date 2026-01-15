package login

import (
	"time"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
	"jiangyi.com/model/system"
	"jiangyi.com/utils"
)

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	NickName string `json:"nickName" binding:"required"`
	Code     string `json:"code"`
	CodeId   string `json:"code_id"`
}

// Register 用户注册
// @Summary      用户注册
// @Description  用户注册
// @Tags         Login
// @Accept       json
// @Produce      json
// @Param        data  body      RegisterRequest  true  "用户名, 密码, 昵称, 验证码"
// @Success      200   {object}  common.Response{msg=string}  "注册成功"
// @Router       /register [post]
func (l *Api) Register(ctx *gin.Context) {
	var params RegisterRequest
	err := ctx.ShouldBindJSON(&params)
	if err != nil {
		common.FailWithMsg(ctx, "获取参数失败")
		return
	}

	// 验证必填字段
	if params.Username == "" || params.Password == "" || params.NickName == "" {
		common.FailWithMsg(ctx, "用户名、密码和昵称不能为空")
		return
	}

	// 验证密码长度
	if len(params.Password) < 6 {
		common.FailWithMsg(ctx, "密码长度不能少于6位")
		return
	}

	// 验证码校验
	key := ctx.ClientIP()
	openCaptcha := global.JY_Config.Captcha.OpenCaptcha
	openCaptchaTimeOut := global.JY_Config.Captcha.OpenCaptchaTimeout
	v, ok := global.JY_BlackCache.Get(key)
	if !ok {
		global.JY_BlackCache.Set(key, 1, time.Second*time.Duration(openCaptchaTimeOut))
	}
	var oc bool = openCaptcha == 0 || openCaptcha < interfaceToInt(v)
	if oc && (params.Code == "" || params.CodeId == "" || !store.Verify(params.CodeId, params.Code, true)) {
		global.JY_BlackCache.Increment(key, 1)
		common.FailWithMsg(ctx, "验证码错误")
		return
	}

	// 检查用户名是否已存在
	var existingUser system.SysUser
	err = global.JY_DB.Where("username = ?", params.Username).First(&existingUser).Error
	if err == nil {
		common.FailWithMsg(ctx, "用户名已存在")
		return
	}

	// 检查昵称是否已存在
	err = global.JY_DB.Where("nick_name = ?", params.NickName).First(&existingUser).Error
	if err == nil {
		common.FailWithMsg(ctx, "昵称已存在")
		return
	}

	// 创建新用户，使用 bcrypt 加密密码
	user := system.SysUser{
		Username:    params.Username,
		Password:    utils.BcryptHash(params.Password), // 使用 bcrypt 加密密码
		NickName:    params.NickName,
		AuthorityId: "888", // 默认角色ID
	}

	err = global.JY_DB.Create(&user).Error
	if err != nil {
		common.FailWithMsg(ctx, "注册失败，请稍后重试")
		return
	}

	common.OkWithMsg(ctx, "注册成功")
}

package login

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"
	"jiangyi.com/global"
	"jiangyi.com/model/common"
)

type SysCaptchaResponse struct {
	CaptchaId     string `json:"captchaId"`
	PicPath       string `json:"picPath"`
	CaptchaLength int    `json:"captchaLength"`
	OpenCaptcha   bool   `json:"openCaptcha"`
}

// GetCaptcha 获取验证码接口
// @Summary      生成验证码
// @Description  生成验证码
// @Tags         Login
// @Produce      json
// @Success      200  {object}  common.Response{data=SysCaptchaResponse,msg=string}  "生成验证码"
// @Router       /login/captcha [get]
func (l *Api) GetCaptcha(ctx *gin.Context) {

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
	var oc bool
	if openCaptcha == 0 || interfaceToInt(v) >= openCaptcha {
		oc = true
	}
	if !oc {
		common.OkWithData(ctx, gin.H{
			"OpenCaptcha": oc,
		})
		return
	}
	driver := base64Captcha.NewDriverDigit(
		global.JY_Config.Captcha.ImgHeight,
		global.JY_Config.Captcha.ImgWidth,
		global.JY_Config.Captcha.KeyLong,
		0.7,
		80,
	)

	cp := base64Captcha.NewCaptcha(driver, store)
	id, b64s, _, err := cp.Generate()
	if err != nil {
		common.Fail(ctx)
	}

	common.OkWithData(ctx, SysCaptchaResponse{
		CaptchaId:     id,
		PicPath:       b64s,
		CaptchaLength: global.JY_Config.Captcha.KeyLong,
		OpenCaptcha:   oc,
	})

}
func interfaceToInt(v interface{}) (i int) {
	switch v := v.(type) {
	case int:
		i = v
	default:
		i = 0
	}
	return
}

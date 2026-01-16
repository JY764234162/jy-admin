package api

import (
	"jiangyi.com/api/authority"
	"jiangyi.com/api/customer"
	"jiangyi.com/api/login"
	"jiangyi.com/api/menu"
	"jiangyi.com/api/upload"
	"jiangyi.com/api/user"
)

var ApiGroup = new(Api)

type Api struct {
	CustomerApi  customer.Api
	UserApi      user.Api
	UploadApi    upload.Api
	LoginApi     login.Api
	AuthorityApi authority.Api
	MenuApi      menu.Api
}

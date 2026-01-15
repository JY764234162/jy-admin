package router

import (
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"jiangyi.com/api"
	_ "jiangyi.com/docs"
	"jiangyi.com/global"
	"jiangyi.com/middleware"
)

type justFilesFilesystem struct {
	fs http.FileSystem
}

func (fs justFilesFilesystem) Open(name string) (http.File, error) {
	f, err := fs.fs.Open(name)
	if err != nil {
		return nil, err
	}

	stat, err := f.Stat()
	if stat.IsDir() {
		return nil, os.ErrPermission
	}

	return f, nil
}

func InitGinRouter() *gin.Engine {
	Router := gin.New()
	//	日志
	if gin.Mode() == gin.DebugMode {
		Router.Use(gin.Logger())
	}
	//	错误处理
	Router.Use(gin.Recovery())

	// CORS 配置
	Router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Content-Length", "Accept-Encoding", "X-CSRF-Token", "Authorization", "Accept", "Cache-Control", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	//注册路由
	registerRouter(Router)

	return Router
}

func registerRouter(Router *gin.Engine) *gin.Engine {
	//开放路由
	publicGroup := Router.Group(global.JY_Config.System.RouterPrefix)
	//私有路由
	privateGroup := Router.Group(global.JY_Config.System.RouterPrefix, middleware.JWTAuth())
	//api分组
	apiGroup := api.ApiGroup

	//登录相关（开放路由，不需要认证）
	{
		publicGroup.GET("/login/captcha", apiGroup.LoginApi.GetCaptcha)
		publicGroup.POST("/login", apiGroup.LoginApi.Login)
		publicGroup.POST("/register", apiGroup.LoginApi.Register)
	}
	//客户管理
	{
		privateGroup.GET("/customer/list", apiGroup.CustomerApi.GetCustomerList)
		privateGroup.POST("/customer", apiGroup.CustomerApi.CreateCustomer)
		privateGroup.PUT("/customer", apiGroup.CustomerApi.UpdateCustomer)
		privateGroup.DELETE("/customer", apiGroup.CustomerApi.DeleteCustomer)
	}
	//用户管理
	{
		privateGroup.GET("/user/list", apiGroup.UserApi.GetUserList)
		privateGroup.POST("/user", apiGroup.UserApi.CreateUser)
		privateGroup.PUT("/user", apiGroup.UserApi.UpdateUser)
		privateGroup.DELETE("/user/:id", apiGroup.UserApi.DeleteUser)
		privateGroup.POST("/user/changePassword", apiGroup.UserApi.ChangePassword)
	}
	//文件管理
	{
		privateGroup.GET("/upload/list", apiGroup.UploadApi.GetFileList)
		privateGroup.POST("/upload", apiGroup.UploadApi.UploadFile)
		privateGroup.DELETE("/upload", apiGroup.UploadApi.DeleteFile)
	}
	//角色管理
	{
		privateGroup.GET("/authority/list", apiGroup.AuthorityApi.GetAuthorityList)
		privateGroup.POST("/authority", apiGroup.AuthorityApi.CreateAuthority)
		privateGroup.PUT("/authority", apiGroup.AuthorityApi.UpdateAuthority)
		privateGroup.DELETE("/authority", apiGroup.AuthorityApi.DeleteAuthority)
	}

	Router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	//开放文件访问
	publicGroup.StaticFS(global.JY_Config.Local.StorePath, justFilesFilesystem{http.Dir(global.JY_Config.Local.StorePath)}) // Router.Use(middleware.LoadTls())  // 如果需要使用https 请打开此中间件 然后前往 core/server.go 将启动模式 更变为 Router.RunTLS("端口","你的cre/pem文件","你的key文件")

	//开放健康检查
	publicGroup.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "Hello, World!")
	})

	// 生产环境：提供前端静态文件服务
	// 注意：在生产环境中，确保前端构建产物位于 ../web/docs 目录
	// 开发环境可以注释掉这部分，使用前端开发服务器
	if gin.Mode() == gin.ReleaseMode {
		// 静态文件服务
		Router.Static("/static", "../web/docs/assets")
		Router.StaticFile("/favicon.svg", "../web/docs/favicon.svg")
		// SPA 路由支持：所有非 API 路由都返回 index.html
		Router.NoRoute(func(c *gin.Context) {
			// 如果是 API 路由，返回 404
			if c.Request.URL.Path[:4] == "/api" {
				c.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "接口不存在"})
				return
			}
			// 否则返回前端页面
			c.File("../web/docs/index.html")
		})
	}

	return Router
}

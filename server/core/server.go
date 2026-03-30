package core

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"jiangyi.com/global"
	"jiangyi.com/router"
)

func RunServer(port string, router *gin.Engine, readTimeout, writeTimeout, idleTimeout time.Duration, maxHeaderBytes int) {
	// 创建服务
	srv := &http.Server{
		Addr:           port,
		Handler:        router,
		ReadTimeout:    readTimeout,
		WriteTimeout:   writeTimeout,
		IdleTimeout:    idleTimeout,
		MaxHeaderBytes: maxHeaderBytes,
	}

	// 在goroutine中启动服务
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("listen: %s\n", err)
			os.Exit(1)
		}
	}()

	// 等待中断信号以优雅地关闭服务器
	quit := make(chan os.Signal, 1)
	// kill (无参数) 默认发送 syscall.SIGTERM
	// kill -2 发送 syscall.SIGINT
	// kill -9 发送 syscall.SIGKILL，但是无法被捕获，所以不需要添加
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("关闭WEB服务...")

	// 设置优雅关闭超时
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(global.JY_Config.System.ShutdownTimeout)*time.Second)

	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("WEB服务关闭异常", err)
	}

	log.Println("WEB服务已关闭")
}

func InitServer() {
	//	注册路由
	ginRouter := router.InitGinRouter()
	//	获取地址
	address := fmt.Sprintf(":%s", global.JY_Config.System.Port)
	//	获取超时时间
	readTimeout := global.JY_Config.System.ReadTimeout
	//	获取写超时时间
	writeTimeout := global.JY_Config.System.WriteTimeout
	//	获取空闲超时时间
	idleTimeout := global.JY_Config.System.IdleTimeout
	//	获取最大头字节
	maxHeaderBytes := global.JY_Config.System.MaxHeaderBytes
	//	服务启动
	fmt.Printf(`
	默认自动化文档地址:http://127.0.0.1%s/swagger/index.html
	默认前端文件运行地址:http://127.0.0.1%s%s
`, address, address, global.JY_Config.System.RouterPrefix)
	RunServer(
		address, ginRouter,
		time.Duration(readTimeout)*time.Second,
		time.Duration(writeTimeout)*time.Second,
		time.Duration(idleTimeout)*time.Second,
		maxHeaderBytes)
}

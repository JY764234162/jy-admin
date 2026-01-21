package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"jiangyi.com/global"
)

// LoggerMiddleware 日志中间件
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// 处理请求
		c.Next()

		// 记录请求日志
		cost := time.Since(start)
		status := c.Writer.Status()

		// 构建日志字段
		logFields := []zap.Field{
			zap.Int("status", status),
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.String("query", query),
			zap.String("ip", c.ClientIP()),
			zap.String("user-agent", c.Request.UserAgent()),
			zap.Duration("cost", cost),
		}

		// 添加用户信息（如果有）
		if userId, exists := c.Get("userId"); exists {
			logFields = append(logFields, zap.Any("userId", userId))
		}
		if username, exists := c.Get("username"); exists {
			logFields = append(logFields, zap.String("username", username.(string)))
		}

		// 根据状态码选择日志级别
		if status >= 500 {
			global.JY_LOG.Error("HTTP请求错误", logFields...)
		} else if status >= 400 {
			global.JY_LOG.Warn("HTTP请求警告", logFields...)
		} else {
			global.JY_LOG.Info("HTTP请求", logFields...)
		}
	}
}

// ErrorLoggerMiddleware 错误日志中间件（专门记录错误）
func ErrorLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 检查是否有错误
		if len(c.Errors) > 0 {
			for _, err := range c.Errors {
				global.JY_LOG.Error("请求处理错误",
					zap.String("method", c.Request.Method),
					zap.String("path", c.Request.URL.Path),
					zap.String("ip", c.ClientIP()),
					zap.String("error", err.Error()),
					zap.Any("meta", err.Meta),
				)
			}
		}
	}
}

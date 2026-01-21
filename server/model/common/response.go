package common

import (
	"net/http"
	"runtime"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"jiangyi.com/global"
)

type Response struct {
	Code int         `json:"code"`
	Data interface{} `json:"data"`
	Msg  string      `json:"msg"`
}

type PageResult struct {
	List     interface{} `json:"list"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

const (
	ERROR   = 7
	SUCCESS = 0
)

func Result(code int, data interface{}, msg string, c *gin.Context) {
	c.JSON(http.StatusOK, Response{
		code,
		data,
		msg,
	})
}

func Ok(c *gin.Context) {
	Result(SUCCESS, map[string]interface{}{}, "操作成功", c)
}
func OkWithMsg(c *gin.Context, msg string) {
	Result(SUCCESS, map[string]interface{}{}, msg, c)
}
func OkWithData(c *gin.Context, data interface{}) {
	Result(SUCCESS, data, "操作成功", c)
}
func OkWithDetailed(c *gin.Context, data interface{}, msg string) {
	Result(SUCCESS, data, msg, c)
}

func Fail(c *gin.Context) {
	logError(c, "操作失败", nil)
	Result(ERROR, map[string]interface{}{}, "操作失败", c)
}
func FailWithData(c *gin.Context, data interface{}) {
	logError(c, "操作失败", nil)
	Result(ERROR, data, "操作失败", c)
}
func FailWithMsg(c *gin.Context, msg string) {
	logError(c, msg, nil)
	Result(ERROR, map[string]interface{}{}, msg, c)
}
func FailWithDetailed(c *gin.Context, data interface{}, msg string) {
	logError(c, msg, nil)
	Result(ERROR, data, msg, c)
}

// FailWithError 记录错误并返回失败响应
func FailWithError(c *gin.Context, msg string, err error) {
	logError(c, msg, err)
	Result(ERROR, map[string]interface{}{}, msg, c)
}

// logError 记录错误日志
func logError(c *gin.Context, msg string, err error) {
	// 获取调用栈信息
	pc, file, line, ok := runtime.Caller(2)
	var funcName string
	if ok {
		fn := runtime.FuncForPC(pc)
		if fn != nil {
			funcName = fn.Name()
			// 只保留函数名，去掉包路径
			parts := strings.Split(funcName, ".")
			if len(parts) > 0 {
				funcName = parts[len(parts)-1]
			}
		}
	}

	// 构建日志字段
	logFields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.String("query", c.Request.URL.RawQuery),
		zap.String("ip", c.ClientIP()),
		zap.String("user-agent", c.Request.UserAgent()),
		zap.String("msg", msg),
	}

	// 添加调用栈信息
	if ok {
		logFields = append(logFields,
			zap.String("file", file),
			zap.Int("line", line),
			zap.String("func", funcName),
		)
	}

	// 添加用户信息（如果有）
	if userId, exists := c.Get("userId"); exists {
		logFields = append(logFields, zap.Any("userId", userId))
	}
	if username, exists := c.Get("username"); exists {
		logFields = append(logFields, zap.String("username", username.(string)))
	}

	// 添加错误信息
	if err != nil {
		logFields = append(logFields, zap.Error(err))
		global.JY_LOG.Error("接口错误", logFields...)
	} else {
		global.JY_LOG.Warn("接口警告", logFields...)
	}
}

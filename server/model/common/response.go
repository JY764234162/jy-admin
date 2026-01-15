package common

import (
	"net/http"

	"github.com/gin-gonic/gin"
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
	Result(ERROR, map[string]interface{}{}, "操作失败", c)
}
func FailWithData(c *gin.Context, data interface{}) {
	Result(ERROR, data, "操作失败", c)
}
func FailWithMsg(c *gin.Context, msg string) {
	Result(ERROR, map[string]interface{}{}, msg, c)
}
func FailWithDetailed(c *gin.Context, data interface{}, msg string) {
	Result(ERROR, data, msg, c)
}

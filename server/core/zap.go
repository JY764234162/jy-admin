package core

import (
	"fmt"
	"os"
	"path/filepath"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
	"jiangyi.com/global"
)

var (
	// ZapLogger 全局日志实例
	ZapLogger *zap.Logger
)

// InitZap 初始化 Zap 日志
func InitZap() {
	// 获取日志配置
	logConfig := global.JY_Config.Log

	// 设置日志级别
	var level zapcore.Level
	switch logConfig.Level {
	case "debug":
		level = zapcore.DebugLevel
	case "info":
		level = zapcore.InfoLevel
	case "warn":
		level = zapcore.WarnLevel
	case "error":
		level = zapcore.ErrorLevel
	default:
		level = zapcore.InfoLevel
	}

	// 编码器配置
	var encoderConfig zapcore.EncoderConfig
	if logConfig.Format == "json" {
		encoderConfig = zap.NewProductionEncoderConfig()
	} else {
		encoderConfig = zap.NewDevelopmentEncoderConfig()
		encoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}
	encoderConfig.EncodeTime = zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05")
	encoderConfig.EncodeCaller = zapcore.ShortCallerEncoder

	// 编码器
	var encoder zapcore.Encoder
	if logConfig.Format == "json" {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	}

	// 创建核心列表
	var cores []zapcore.Core

	// 控制台输出
	if logConfig.Output == "stdout" || logConfig.Output == "both" {
		consoleCore := zapcore.NewCore(
			encoder,
			zapcore.AddSync(os.Stdout),
			level,
		)
		cores = append(cores, consoleCore)
	}

	// 文件输出
	if logConfig.Output == "file" || logConfig.Output == "both" {
		// 确保日志目录存在
		if logConfig.Path != "" {
			if err := os.MkdirAll(logConfig.Path, 0755); err != nil {
				fmt.Printf("创建日志目录失败: %v\n", err)
			}
		}

		// 日志文件路径
		logFile := filepath.Join(logConfig.Path, logConfig.FileName)

		// 使用 lumberjack 进行日志轮转
		writer := &lumberjack.Logger{
			Filename:   logFile,
			MaxSize:    logConfig.MaxSize,    // MB
			MaxBackups: logConfig.MaxBackups, // 保留的旧文件数量
			MaxAge:     logConfig.MaxAge,     // 保留天数
			Compress:   logConfig.Compress,   // 是否压缩
		}

		fileCore := zapcore.NewCore(
			encoder,
			zapcore.AddSync(writer),
			level,
		)
		cores = append(cores, fileCore)
	}

	// 如果没有配置输出，默认输出到控制台
	if len(cores) == 0 {
		cores = append(cores, zapcore.NewCore(
			zapcore.NewConsoleEncoder(encoderConfig),
			zapcore.AddSync(os.Stdout),
			level,
		))
	}

	// 创建 logger
	zapCore := zapcore.NewTee(cores...)
	ZapLogger = zap.New(zapCore, zap.AddCaller(), zap.AddCallerSkip(1), zap.AddStacktrace(zapcore.ErrorLevel))

	// 设置全局 logger
	zap.ReplaceGlobals(ZapLogger)

	// 设置全局日志实例
	global.JY_LOG = ZapLogger

	// 记录初始化日志
	ZapLogger.Info("日志系统初始化成功",
		zap.String("level", logConfig.Level),
		zap.String("format", logConfig.Format),
		zap.String("output", logConfig.Output),
	)
}

// GetLogger 获取日志实例（兼容性函数）
func GetLogger() *zap.Logger {
	if ZapLogger == nil {
		// 如果未初始化，返回一个默认的 logger
		logger, _ := zap.NewDevelopment()
		return logger
	}
	return ZapLogger
}

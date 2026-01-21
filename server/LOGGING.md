# 日志功能使用指南

## 📋 概述

项目已集成基于 `zap` 的结构化日志系统，支持：
- ✅ 结构化日志记录
- ✅ 多级别日志（debug, info, warn, error）
- ✅ 日志文件轮转（自动压缩和清理）
- ✅ 控制台和文件双重输出
- ✅ 接口错误自动记录
- ✅ 请求日志记录（包含请求信息、响应状态、耗时等）

## 🔧 配置说明

在 `config.yaml` 中配置日志：

```yaml
log:
  level: info          # 日志级别: debug, info, warn, error
  format: console      # 日志格式: json, console
  output: both         # 输出位置: stdout, file, both
  path: ./logs         # 日志文件路径
  file-name: app.log   # 日志文件名
  max-size: 100        # 单个日志文件最大大小(MB)
  max-backups: 7       # 保留的旧日志文件数量
  max-age: 30          # 保留日志文件的最大天数
  compress: true        # 是否压缩旧日志文件
```

### 配置项说明

| 配置项 | 类型 | 说明 | 可选值 |
|--------|------|------|--------|
| `level` | string | 日志级别 | `debug`, `info`, `warn`, `error` |
| `format` | string | 日志格式 | `json`, `console` |
| `output` | string | 输出位置 | `stdout`, `file`, `both` |
| `path` | string | 日志文件目录 | 相对或绝对路径 |
| `file-name` | string | 日志文件名 | 任意文件名 |
| `max-size` | int | 单个文件最大大小(MB) | 正整数 |
| `max-backups` | int | 保留的旧文件数量 | 正整数 |
| `max-age` | int | 保留天数 | 正整数 |
| `compress` | bool | 是否压缩旧文件 | `true`, `false` |

## 📝 使用方式

### 1. 在代码中使用日志

```go
import "jiangyi.com/global"

// Info 级别日志
global.JY_LOG.Info("操作成功", 
    zap.String("username", "admin"),
    zap.Int("userId", 123),
)

// Error 级别日志
global.JY_LOG.Error("操作失败", 
    zap.Error(err),
    zap.String("operation", "createUser"),
)

// Warn 级别日志
global.JY_LOG.Warn("警告信息", 
    zap.String("reason", "资源不足"),
)

// Debug 级别日志（仅在 debug 级别时输出）
global.JY_LOG.Debug("调试信息", 
    zap.Any("data", someData),
)
```

### 2. 接口错误自动记录

使用 `common.FailWithError()` 会自动记录错误日志：

```go
// 自动记录错误日志
common.FailWithError(ctx, "操作失败", err)

// 或者使用带错误信息的版本
if err != nil {
    common.FailWithError(ctx, "创建用户失败", err)
    return
}
```

### 3. 其他响应函数

```go
// 这些函数也会自动记录错误日志
common.Fail(ctx)                    // 记录 "操作失败"
common.FailWithMsg(ctx, "错误信息")  // 记录指定的错误信息
common.FailWithDetailed(ctx, data, "错误信息")  // 记录错误信息和数据
```

## 🔍 日志内容说明

### 请求日志

每个 HTTP 请求都会记录以下信息：
- HTTP 状态码
- 请求方法（GET, POST 等）
- 请求路径
- 查询参数
- 客户端 IP
- User-Agent
- 请求耗时
- 用户信息（如果已登录）

示例日志：
```
2024-01-16 15:30:45 INFO  HTTP请求  {"status": 200, "method": "POST", "path": "/api/login", "ip": "127.0.0.1", "cost": "15.2ms"}
```

### 错误日志

接口错误会记录：
- 错误消息
- 错误详情（如果有）
- 请求信息
- 调用栈信息（文件、行号、函数名）
- 用户信息（如果已登录）

示例日志：
```
2024-01-16 15:30:45 ERROR 接口错误  {"method": "POST", "path": "/api/login", "ip": "127.0.0.1", "msg": "用户不存在或密码错误", "error": "record not found", "file": "api/login/login.go", "line": 68, "func": "Login"}
```

## 📂 日志文件

### 文件位置

日志文件保存在 `config.yaml` 中配置的 `path` 目录下，文件名为 `file-name`。

默认配置：
- 路径：`./logs`
- 文件名：`app.log`
- 完整路径：`./logs/app.log`

### 日志轮转

当日志文件达到 `max-size` 大小时，会自动轮转：
- 当前文件重命名为 `app.log.20240116-153045.log`（带时间戳）
- 创建新的 `app.log` 文件
- 保留最近 `max-backups` 个旧文件
- 删除超过 `max-age` 天的旧文件
- 如果 `compress` 为 `true`，旧文件会被压缩为 `.gz` 格式

## 🎯 最佳实践

### 1. 日志级别选择

- **Debug**: 详细的调试信息，生产环境通常不启用
- **Info**: 一般信息，如操作成功、重要事件
- **Warn**: 警告信息，如资源不足、配置问题
- **Error**: 错误信息，如操作失败、异常情况

### 2. 日志内容

- ✅ 记录关键操作和错误
- ✅ 包含足够的上下文信息（用户ID、操作类型等）
- ✅ 敏感信息（密码、token）不要记录
- ✅ 使用结构化字段，便于查询和分析

### 3. 性能考虑

- 日志记录是异步的，不会阻塞主流程
- 生产环境建议使用 `json` 格式，便于日志收集和分析
- 合理设置日志级别，避免过多日志影响性能

## 🔧 环境配置

### 开发环境

```yaml
log:
  level: debug
  format: console
  output: stdout
```

### 生产环境

```yaml
log:
  level: info
  format: json
  output: both
  path: /var/log/jy-admin
  file-name: app.log
  max-size: 100
  max-backups: 7
  max-age: 30
  compress: true
```

## 📊 日志查询示例

### 查看错误日志

```bash
# 查看所有错误日志
grep "ERROR" logs/app.log

# 查看特定接口的错误
grep "ERROR.*/api/login" logs/app.log

# 查看特定用户的错误
grep "ERROR.*userId.*123" logs/app.log
```

### JSON 格式日志查询

如果使用 JSON 格式，可以使用 `jq` 工具：

```bash
# 查看所有错误
cat logs/app.log | jq 'select(.level == "error")'

# 查看特定路径的请求
cat logs/app.log | jq 'select(.path == "/api/login")'

# 查看耗时超过 1 秒的请求
cat logs/app.log | jq 'select(.cost > "1s")'
```

## 🐛 故障排查

### 日志文件未创建

1. 检查 `path` 目录是否有写权限
2. 检查磁盘空间是否充足
3. 查看应用启动日志，确认日志系统初始化成功

### 日志未输出

1. 检查日志级别配置，确保日志级别足够低
2. 检查 `output` 配置，确认输出位置正确
3. 查看应用启动日志，确认日志系统初始化成功

### 日志文件过大

1. 调整 `max-size` 配置，减小单个文件大小
2. 调整 `max-backups` 和 `max-age`，减少保留的文件数量
3. 启用 `compress` 压缩旧文件

## 📚 相关文件

- `core/zap.go` - 日志初始化模块
- `middleware/logger.go` - 日志中间件
- `model/common/response.go` - 响应函数（包含错误日志记录）
- `config/log.go` - 日志配置结构
- `config.yaml` - 日志配置文件


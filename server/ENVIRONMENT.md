# Go 后端环境区分指南

## 📋 当前环境区分机制

### 1. Gin 模式（GIN_MODE）

项目主要通过 `GIN_MODE` 环境变量区分开发和生产环境：

```bash
# 开发环境（默认）
export GIN_MODE=debug
# 或
export GIN_MODE=release
```

**代码中的使用：**

```go
// server/router/enter.go
if gin.Mode() == gin.DebugMode {
    Router.Use(gin.Logger())  // 开发环境启用详细日志
}

if gin.Mode() == gin.ReleaseMode {
    // 生产环境提供静态文件服务
    Router.Static("/assets", "../web/docs/assets")
}
```

### 2. 配置文件（config.yaml）

当前使用统一的 `config.yaml` 配置文件，所有环境共用。

## 🔧 改进方案：支持多环境配置

### 方案一：使用环境变量 + 多配置文件（推荐）

#### 1. 创建多环境配置文件

```bash
server/
├── config.yaml          # 默认配置（开发环境）
├── config.dev.yaml      # 开发环境
├── config.test.yaml     # 测试环境
└── config.prod.yaml     # 生产环境
```

#### 2. 修改 `core/viper.go`

```go
package core

import (
    "fmt"
    "log"
    "os"
    
    "github.com/fsnotify/fsnotify"
    "github.com/spf13/viper"
    "jiangyi.com/global"
)

func InitViper() {
    v := viper.New()
    
    // 获取环境变量，默认为 dev
    env := os.Getenv("APP_ENV")
    if env == "" {
        env = "dev"
    }
    
    // 根据环境加载不同的配置文件
    configName := "config"
    if env != "dev" {
        configName = fmt.Sprintf("config.%s", env)
    }
    
    v.SetConfigName(configName)
    v.SetConfigType("yaml")
    v.AddConfigPath(".")
    
    // 支持环境变量覆盖配置
    v.AutomaticEnv()
    v.SetEnvPrefix("JY")
    v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
    
    if err := v.ReadInConfig(); err != nil {
        log.Fatalf("Failed to read config file: %v", err)
    }
    
    v.WatchConfig()
    v.OnConfigChange(func(e fsnotify.Event) {
        fmt.Println("config file changed:", e.Name)
        if err := v.Unmarshal(&global.JY_Config); err != nil {
            log.Fatalf("Failed to unmarshal config: %v", err)
        }
    })
    
    if err := v.Unmarshal(&global.JY_Config); err != nil {
        log.Fatalf("Failed to unmarshal config: %v", err)
    }
    
    fmt.Printf("读取配置成功: %s.yaml (环境: %s)\n", configName, env)
    global.JY_Viper = v
}
```

#### 3. 创建环境配置文件

**config.dev.yaml**（开发环境）：
```yaml
system:
  db-type: sqlite
  port: 7777
  read-timeout: 600
  write-timeout: 600
sqlite:
  db-name: 'jiangyi_dev'
  max-idle-conns: 5
  max-open-conns: 20
jwt:
  signing-key: dev-secret-key
  expires-time: 24h
```

**config.prod.yaml**（生产环境）：
```yaml
system:
  db-type: sqlite
  port: 7777
  read-timeout: 300
  write-timeout: 300
sqlite:
  db-name: 'jiangyi_prod'
  max-idle-conns: 5
  max-open-conns: 50
jwt:
  signing-key: ${JWT_SECRET_KEY}  # 从环境变量读取
  expires-time: 7d
```

#### 4. 使用方式

```bash
# 开发环境（默认）
go run main.go

# 测试环境
APP_ENV=test go run main.go

# 生产环境
APP_ENV=prod go run main.go
# 或
export APP_ENV=prod
./jy-admin
```

### 方案二：使用环境变量覆盖（简单）

保持单一 `config.yaml`，通过环境变量覆盖：

```go
// core/viper.go
v.AutomaticEnv()
v.SetEnvPrefix("JY")
v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

// 使用方式：
// JY_SYSTEM_PORT=8888 go run main.go
// JY_SQLITE_DB_NAME=jiangyi_prod go run main.go
```

## 📝 不同环境需要注意的配置项

### 1. **数据库配置**

| 配置项 | 开发环境 | 生产环境 | 说明 |
|--------|---------|---------|------|
| `db-name` | `jiangyi_dev` | `jiangyi_prod` | 不同环境使用不同数据库 |
| `max-idle-conns` | 5 | 5-10 | 生产环境可适当增加 |
| `max-open-conns` | 20 | 50-100 | 生产环境根据并发调整 |
| `log-mode` | `info` | `warn` 或 `error` | 生产环境减少日志输出 |

### 2. **系统配置**

| 配置项 | 开发环境 | 生产环境 | 说明 |
|--------|---------|---------|------|
| `port` | 7777 | 7777 | 可配置不同端口 |
| `read-timeout` | 600 | 300 | 生产环境降低超时 |
| `write-timeout` | 600 | 300 | 生产环境降低超时 |
| `disable-auto-migrate` | `false` | `true` | 生产环境禁用自动迁移 |

### 3. **JWT 配置**

| 配置项 | 开发环境 | 生产环境 | 说明 |
|--------|---------|---------|------|
| `signing-key` | `dev-secret` | 强密钥（环境变量） | 生产环境必须使用强密钥 |
| `expires-time` | `24h` | `7d` | 生产环境适当延长 |
| `buffer-time` | `1h` | `1d` | 生产环境适当延长 |

### 4. **CORS 配置**

**开发环境** (`server/router/enter.go`)：
```go
AllowOrigins: []string{
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
}
```

**生产环境**：
```go
AllowOrigins: []string{
    "https://yourdomain.com",
    "https://www.yourdomain.com",
}
```

### 5. **日志配置**

| 配置项 | 开发环境 | 生产环境 | 说明 |
|--------|---------|---------|------|
| `gin.Logger()` | 启用 | 禁用 | 开发环境需要详细日志 |
| `log-mode` | `info` | `warn` | GORM 日志级别 |
| `log-zap` | `false` | `true` | 生产环境使用结构化日志 |

### 6. **静态文件服务**

| 环境 | 配置 | 说明 |
|------|------|------|
| 开发环境 | 不启用 | 使用前端开发服务器 |
| 生产环境 | `gin.ReleaseMode` 时启用 | 提供静态文件服务 |

### 7. **Swagger 文档**

| 环境 | 配置 | 说明 |
|------|------|------|
| 开发环境 | 启用 | 方便 API 调试 |
| 生产环境 | 建议禁用或限制访问 | 安全考虑 |

## 🔒 安全注意事项

### 1. **敏感信息**

- ✅ **开发环境**：可以使用简单密钥
- ❌ **生产环境**：必须使用环境变量存储敏感信息
  ```bash
  export JWT_SECRET_KEY="your-very-long-random-secret-key"
  export DB_PASSWORD="your-db-password"
  ```

#### 📌 环境变量作用域说明

**`export` 命令设置的是系统级别的环境变量**，不是 Go 语言特有的：

1. **系统级别**：环境变量属于操作系统/Shell 会话级别
   - 当前 Shell 会话及其所有子进程都可以访问
   - 其他程序（Python、Node.js、Java 等）也可以读取
   - 不是 Go 语言专用的

2. **作用域**：
   ```bash
   # 当前 Shell 会话有效
   export JWT_SECRET_KEY="secret"
   
   # 当前 Shell 和子进程可见
   # 关闭终端后失效（除非写入 ~/.bashrc 等）
   ```

3. **Go 程序读取方式**：
   ```go
   // Go 通过标准库读取系统环境变量
   secretKey := os.Getenv("JWT_SECRET_KEY")
   ```

4. **不同设置方式的区别**：

   | 方式 | 作用域 | 持久性 | 适用场景 |
   |------|--------|--------|---------|
   | `export VAR=value` | 当前 Shell + 子进程 | 会话级别 | 临时测试 |
   | `VAR=value command` | 仅该命令 | 一次性 | 单次运行 |
   | `~/.bashrc` / `~/.zshrc` | 用户级别 | 永久 | 开发环境 |
   | `/etc/environment` | 系统级别 | 永久 | 系统配置 |
   | systemd `Environment=` | 服务级别 | 服务生命周期 | 生产环境 |
   | Docker `ENV` | 容器级别 | 容器生命周期 | 容器部署 |

5. **最佳实践**：

   **开发环境**：
   ```bash
   # 方式1：临时设置（推荐）
   export JWT_SECRET_KEY="dev-secret"
   go run main.go
   
   # 方式2：单次运行
   JWT_SECRET_KEY="dev-secret" go run main.go
   
   # 方式3：写入 ~/.bashrc（永久）
   echo 'export JWT_SECRET_KEY="dev-secret"' >> ~/.bashrc
   source ~/.bashrc
   ```

   **生产环境**：
   ```bash
   # 方式1：systemd 服务（推荐）
   # /etc/systemd/system/jy-admin.service
   [Service]
   Environment="JWT_SECRET_KEY=your-production-secret"
   
   # 方式2：Docker
   # Dockerfile
   ENV JWT_SECRET_KEY=your-production-secret
   
   # 方式3：.env 文件（需要工具支持）
   # 使用 godotenv 等库读取
   ```

6. **安全注意事项**：
   - ✅ 环境变量可以被同一进程的所有子进程访问
   - ✅ 其他程序也可以读取（通过 `/proc/PID/environ`）
   - ⚠️ 不要将敏感信息写入代码或配置文件
   - ⚠️ 生产环境使用专门的密钥管理服务（如 AWS Secrets Manager、HashiCorp Vault）

### 2. **数据库**

- ✅ **开发环境**：可以使用 SQLite，数据库文件可提交到版本控制（测试数据）
- ❌ **生产环境**：
  - 数据库文件不要提交到版本控制
  - 使用独立的数据库实例
  - 定期备份

### 3. **错误信息**

- ✅ **开发环境**：显示详细错误信息
- ❌ **生产环境**：隐藏敏感错误信息，只返回通用错误

### 4. **调试功能**

- ✅ **开发环境**：启用所有调试功能
- ❌ **生产环境**：禁用调试功能，如：
  - 自动数据库迁移
  - 详细日志
  - Swagger 文档（或限制访问）

## 📊 环境判断工具函数

创建 `core/env.go`：

```go
package core

import (
    "os"
    "github.com/gin-gonic/gin"
)

const (
    EnvDev  = "dev"
    EnvTest = "test"
    EnvProd = "prod"
)

// GetEnv 获取当前环境
func GetEnv() string {
    env := os.Getenv("APP_ENV")
    if env == "" {
        // 如果没有设置 APP_ENV，根据 GIN_MODE 判断
        if gin.Mode() == gin.ReleaseMode {
            return EnvProd
        }
        return EnvDev
    }
    return env
}

// IsDev 是否为开发环境
func IsDev() bool {
    return GetEnv() == EnvDev
}

// IsProd 是否为生产环境
func IsProd() bool {
    return GetEnv() == EnvProd
}

// IsTest 是否为测试环境
func IsTest() bool {
    return GetEnv() == EnvTest
}
```

使用示例：

```go
// server/router/enter.go
if core.IsDev() {
    Router.Use(gin.Logger())
}

if core.IsProd() {
    // 生产环境特殊配置
}
```

## 🚀 部署时的环境设置

### Docker 部署

```dockerfile
# Dockerfile
ENV APP_ENV=prod
ENV GIN_MODE=release
```

### systemd 服务

```ini
[Service]
Environment="APP_ENV=prod"
Environment="GIN_MODE=release"
Environment="JWT_SECRET_KEY=your-secret-key"
```

### 直接运行

```bash
# 开发环境
export APP_ENV=dev
export GIN_MODE=debug
go run main.go

# 生产环境
export APP_ENV=prod
export GIN_MODE=release
export JWT_SECRET_KEY=your-secret-key
./jy-admin
```

## 📚 总结

### 当前项目环境区分方式：

1. **GIN_MODE**：`debug`（开发）或 `release`（生产）
2. **配置文件**：统一的 `config.yaml`
3. **代码判断**：`gin.Mode() == gin.DebugMode` 或 `gin.ReleaseMode`

### 建议改进：

1. ✅ 添加 `APP_ENV` 环境变量支持多环境
2. ✅ 创建多环境配置文件（`config.dev.yaml`, `config.prod.yaml`）
3. ✅ 敏感信息使用环境变量
4. ✅ 根据环境调整日志级别和超时时间
5. ✅ 生产环境禁用自动迁移和调试功能


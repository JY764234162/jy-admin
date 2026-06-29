# server/CLAUDE.md

本文件为 Claude Code 操作 `server/`（Go 后端）模块提供的专项指南。根目录 `../CLAUDE.md` 中的全局约定（中文输出、最小改动、禁止提交密钥等）仍然适用。

## 模块定位

`server/` 是 JY-Admin 的 Go 后端服务，基于 **Gin + GORM + zap + viper**，对外提供 RESTful API 与 WebSocket 服务。

## 技术栈

- **Web 框架**：Gin v1
- **ORM**：GORM v2
- **配置**：viper（支持环境变量插值 `${VAR}`）
- **日志**：zap
- **认证**：JWT + 内存黑名单
- **文档**：Swagger（gin-swagger），注释使用 `// @Summary`、`// @Router` 等标准 tag
- **数据库**：MySQL（生产），SQLite 仅用于部分本地测试
- **文件存储**：本地 或 腾讯云 COS
- **定时任务**：内置 cron

## 目录结构

```text
server/
├── main.go                 # 入口：初始化 viper/zap/OSS/GORM → 注册表 → 启动服务
├── api/                    # 按领域分组的 HTTP handler
│   ├── login/              # 登录/登出/刷新 token
│   ├── user/               # 用户 CRUD
│   ├── menu/               # 菜单管理
│   ├── authority/          # 角色权限
│   ├── upload/             # 文件上传
│   ├── customer/           # 客户/业务模块示例
│   └── ai/                 # 与 ai-server 交互的代理接口
├── config/                 # viper 配置结构体与加载逻辑
├── config.dev.yaml         # 本地开发配置
├── config.docker.yaml      # Docker 部署配置（必填）
├── core/                   # 核心初始化：viper/zap/GORM/OSS/服务器生命周期/cron
├── global/                 # 全局变量（如全局 GORM DB、配置对象）
├── middleware/             # JWTAuth、RBAC、操作日志、错误日志
├── model/                  # GORM 模型
│   ├── system/             # 系统表：用户、角色、菜单、JWT 黑名单等
│   ├── business/           # 业务表
│   └── common/             # 公共响应/请求结构体
├── router/                 # 路由注册入口
├── service/                # 业务逻辑层（如存在）
├── tools/                  # 工具函数
├── utils/                  # 通用工具（upload、jwt 等）
├── websocket/              # WebSocket Hub（协同编辑、五子棋、麻将）
└── worker/                 # 后台 worker
```

## 常用命令

```bash
cd server

# 下载依赖
go mod download

# 本地运行（读取 config.dev.yaml）
go run main.go

# 构建
go build -o jy-admin-server main.go

# 生成/更新 Swagger 文档（若已安装 swag）
swag init

# 格式化
go fmt ./...

# 静态检查（推荐安装 golangci-lint）
golangci-lint run ./...
```

- 本地接口：`http://localhost:7777`
- Swagger：`http://localhost:7777/swagger/index.html`

## 开发约定

### 1. Handler 组织

- 每个领域一个子包 `server/api/<domain>/`。
- 包内入口文件通常命名为 `enter.go`，再按功能拆分为 `xxx.go`。
- Handler 函数签名统一：`func xxx(c *gin.Context)`。
- 返回统一使用 `response.OkWithData` / `response.FailWithMessage` 等封装函数，不要直接 `c.JSON`。

### 2. 路由注册

- 所有路由在 `server/router/enter.go` 中集中注册。
- 公开路由直接注册，不调用 `JWTAuth()`。
- 私有路由分组使用 `JWTAuth()` 与 `middleware.Rbac(...)`。
- Swagger、静态文件、WebSocket 端点也在该文件注册。

### 3. GORM 模型

- 系统表模型放 `server/model/system/`，业务表放 `server/model/business/`。
- 公共字段使用内嵌 `model.Model`（通常含 `ID`、`CreatedAt`、`UpdatedAt`、`DeletedAt`）。
- 表名使用复数小写下划线，通过 `TableName() string` 显式返回。
- 新增模型后，必须在 `server/core/gorm.go` 的注册函数中注册，否则不会建表。

### 4. JWT / RBAC

- 登录后下发 JWT，大部分 `/api/*` 私有路由需要请求头：`Authorization: Bearer <token>`。
- `server/middleware/jwt.go` 负责解析与黑名单校验。
- RBAC 中间件根据用户 `authority_id` 与请求路径判断权限。
- 退出登录时将 token 加入内存黑名单，并写入数据库。

### 5. 配置

- `config.dev.yaml` 用于本地，支持 `${JWT_SIGNING_KEY}` 形式的环境变量插值。
- `config.docker.yaml` 用于 Docker 部署，必须存在。
- 新增配置项时：
  1. 在 `server/config/` 的结构体中定义字段；
  2. 在 `config.dev.yaml` 和 `config.docker.yaml` 中给出默认值；
  3. 通过 `global.GVA_CONFIG` 访问。

### 6. 文件上传

- 上传接口在 `server/api/upload/`。
- 支持本地存储或腾讯云 COS，由配置 `system.oss-type` 决定。
- 本地文件默认保存到 `server/uploads/`；该目录已加入 `.gitignore`。

### 7. WebSocket

- `server/websocket/` 下每种游戏/功能一个 Hub。
- Hub 负责管理连接、广播消息、处理业务状态。
- WebSocket 端点在 `router/enter.go` 注册，例如 `/api/ws/game`。

### 8. 日志与错误

- 使用 zap：业务日志 `global.GVA_LOG`，请求日志由 Gin 中间件打印。
- 错误处理优先返回统一响应，不要 panic；必要时记录 `zap.Error`。

### 9. 代码风格

- 使用 `go fmt` 格式化。
- 导出的函数/结构体必须写 Go docstring（中文）。
- 包内错误变量使用 `errors.New` 或 `fmt.Errorf`；跨包错误建议使用有类型的 sentinel error。
- 避免在 handler 中写大量业务逻辑，复杂逻辑下沉到 service 或 tools。

## 新增 API 的标准流程

1. 在 `server/model/` 新增/复用模型，并在 `core/gorm.go` 注册。
2. 在 `server/api/<domain>/` 新增 handler。
3. 在 `server/router/enter.go` 注册路由，判断是否需要 `JWTAuth()` / RBAC。
4. 如需要 Swagger，添加标准注释后执行 `swag init`。
5. 本地 `go run main.go` 验证接口。

## 注意事项

- 不要提交 `server/config.dev.yaml` 中真实填充的密钥；该文件已加入 `.gitignore`，但提交前仍需检查。
- `server/logs/` 为运行时日志目录，不要提交。
- 本模块当前未配置 Go 测试套件，新增关键逻辑建议补充单元测试或接口测试。

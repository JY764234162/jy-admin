# JY-Admin 管理系统

一个基于 Gin + React 的全栈管理系统，提供用户管理、角色权限、文件管理、客户管理等核心功能。

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [部署指南](#部署指南)
- [配置说明](#配置说明)
- [API 文档](#api-文档)
- [常见问题](#常见问题)

## ✨ 功能特性

### 核心功能

- 🔐 **用户认证**
  - JWT Token 认证
  - 登录/注册
  - 密码加密（Bcrypt）
  - Token 黑名单管理

- 👥 **用户管理**
  - 用户列表、创建、编辑、删除
  - 用户资料管理
  - 密码修改/重置
  - 头像上传

- 🔑 **角色权限管理（RBAC）**
  - 角色创建和管理
  - 菜单权限配置
  - 基于角色的访问控制
  - 权限中间件验证

- 📁 **文件管理**
  - 文件上传/下载
  - 文件列表管理
  - 支持本地存储和腾讯云 COS
  - 图片预览

- 👤 **客户管理**
  - 客户信息管理
  - CRUD 操作
  - 数据分页查询

### 技术特性

- 🚀 **高性能**
  - Go 语言后端，高并发支持
  - React 前端，组件化开发
  - 数据库连接池优化

- 🔒 **安全性**
  - JWT Token 认证
  - 密码 Bcrypt 加密
  - CORS 跨域配置
  - SQL 注入防护（GORM）

- 📦 **存储方案**
  - 支持本地文件存储
  - 支持腾讯云 COS 对象存储
  - 可扩展的 OSS 接口

- 🗄️ **数据库支持**
  - MySQL（生产环境）
  - SQLite（开发环境）
  - GORM 自动迁移

- 📝 **日志系统**
  - Zap 结构化日志
  - 日志文件轮转
  - 控制台和文件双输出
  - 堆栈信息记录

## 🛠️ 技术栈

### 后端

- **语言**: Go 1.23+
- **框架**: Gin 1.11.0
- **ORM**: GORM 1.31.1
- **数据库**: MySQL 8.0 / SQLite
- **认证**: JWT (golang-jwt/jwt/v5)
- **配置**: Viper
- **日志**: Zap
- **文件存储**: 本地存储 / 腾讯云 COS

### 前端

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **UI 库**: Ant Design
- **状态管理**: Redux Toolkit
- **路由**: React Router DOM
- **HTTP 客户端**: Axios
- **包管理**: pnpm

### 部署

- **容器化**: Docker & Docker Compose
- **Web 服务器**: Nginx
- **数据库**: MySQL 8.0

## 📁 项目结构

```
jy-admin/
├── server/                 # 后端服务
│   ├── api/               # API 接口
│   │   ├── authority/      # 角色权限管理
│   │   ├── customer/       # 客户管理
│   │   ├── login/          # 登录认证
│   │   ├── menu/           # 菜单管理
│   │   ├── upload/         # 文件上传
│   │   └── user/           # 用户管理
│   ├── config/             # 配置结构
│   ├── core/               # 核心功能
│   │   ├── gorm.go         # 数据库初始化
│   │   ├── oss.go          # OSS 存储初始化
│   │   ├── server.go       # 服务器启动
│   │   ├── viper.go        # 配置管理
│   │   └── zap.go          # 日志初始化
│   ├── middleware/         # 中间件
│   │   ├── jwt.go          # JWT 认证
│   │   ├── logger.go       # 日志记录
│   │   └── rbac.go         # 权限验证
│   ├── model/              # 数据模型
│   ├── router/             # 路由配置
│   ├── utils/              # 工具函数
│   ├── config.dev.yaml     # 开发环境配置
│   ├── config.docker.yaml   # Docker 环境配置
│   └── main.go             # 入口文件
│
├── web/                    # 前端项目
│   ├── packages/
│   │   ├── web/            # 前端应用
│   │   │   ├── src/
│   │   │   │   ├── api/    # API 接口
│   │   │   │   ├── pages/  # 页面组件
│   │   │   │   ├── Layout/ # 布局组件
│   │   │   │   └── utils/  # 工具函数
│   │   │   └── package.json
│   │   └── utils/          # 共享工具库
│   └── package.json
│
└── deploy/                 # 部署配置
    ├── docker-compose.yml  # Docker Compose 配置
    ├── deploy.sh           # 部署脚本
    ├── server/             # 后端部署配置
    ├── web/                # 前端部署配置
    └── mysql/              # MySQL 配置
        ├── init.sql        # 初始化脚本
        ├── backup.sh       # 备份脚本
        └── restore.sh      # 恢复脚本
```

## 🚀 快速开始

### 环境要求

- Go 1.23+
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose（用于部署）
- MySQL 8.0（生产环境）或 SQLite（开发环境）

### 本地开发

#### 1. 克隆项目

```bash
git clone <repository-url>
cd jy-admin
```

#### 2. 后端启动

```bash
cd server

# 安装依赖
go mod download

# 配置环境变量（可选）
export GIN_MODE=debug
export JWT_SIGNING_KEY=your-secret-key

# 启动服务
go run main.go
```

后端服务默认运行在 `http://localhost:7777`

#### 3. 前端启动

```bash
cd web

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

前端服务默认运行在 `http://localhost:5173`

#### 4. 访问系统

- 前端地址: http://localhost:5173
- API 文档: http://localhost:7777/swagger/index.html
- 默认账号: `admin` / `123456`

### Docker 部署

#### 1. 准备环境变量

```bash
cd deploy
cp .env.example .env
# 编辑 .env 文件，设置必要的环境变量
```

#### 2. 执行部署

```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

#### 3. 访问系统

- 前端地址: http://localhost
- 健康检查: http://localhost/api/health

详细部署说明请参考 [部署指南](deploy/DEPLOYMENT_GUIDE.md)

## 💻 开发指南

### 后端开发

#### 添加新的 API 接口

1. 在 `server/api/` 下创建新的 API 文件
2. 在 `server/router/enter.go` 中注册路由
3. 在 `server/model/` 中定义数据模型（如需要）

#### 数据库迁移

系统使用 GORM 自动迁移，在 `server/core/init_db.go` 中配置：

```go
db.AutoMigrate(
    &model.User{},
    &model.Customer{},
    // 添加新的模型
)
```

#### 配置管理

配置文件位于 `server/config.dev.yaml`（开发）或 `server/config.docker.yaml`（生产）

### 前端开发

#### 添加新页面

1. 在 `web/packages/web/src/pages/` 下创建页面组件
2. 在路由配置中添加路由
3. 在菜单配置中添加菜单项（如需要）

#### API 调用

API 接口定义在 `web/packages/web/src/api/` 目录下，使用统一的 `request` 工具发送请求。

## 📦 部署指南

### Docker Compose 部署（推荐）

详细步骤请参考 [部署指南](deploy/DEPLOYMENT_GUIDE.md)

### 手动部署

#### 后端部署

```bash
cd server
go build -o jy-admin main.go
./jy-admin
```

#### 前端部署

```bash
cd web
pnpm build
# 将 dist 目录部署到 Nginx 或其他 Web 服务器
```

## ⚙️ 配置说明

### 后端配置

主要配置文件：

- `config.dev.yaml` - 开发环境配置
- `config.docker.yaml` - Docker 环境配置

关键配置项：

```yaml
system:
  db-type: mysql          # 数据库类型: mysql, sqlite
  oss-type: tencent-cos   # 存储类型: local, tencent-cos
  port: 7777              # 服务端口

jwt:
  signing-key: your-key   # JWT 签名密钥
  expires-time: 7d        # Token 过期时间

mysql:
  host: localhost
  port: 3306
  database: jy_admin
  username: root
  password: password

cos:
  secret-id: your-id      # 腾讯云 SecretId
  secret-key: your-key    # 腾讯云 SecretKey
  region: ap-beijing      # 地域
  bucket: your-bucket     # 存储桶名称
```

### 环境变量

支持通过环境变量覆盖配置：

- `GIN_MODE` - Gin 运行模式（debug/release）
- `JWT_SIGNING_KEY` - JWT 签名密钥
- `MYSQL_PASSWORD` - MySQL 密码
- `COS_SECRET_ID` - 腾讯云 COS SecretId
- `COS_SECRET_KEY` - 腾讯云 COS SecretKey

### 前端配置

前端配置主要在 `web/packages/web/vite.config.ts` 中，API 基础地址在 `web/packages/web/src/utils/request.ts` 中配置。

## 📚 API 文档

### Swagger 文档

启动后端服务后，访问：

```
http://localhost:7777/swagger/index.html
```

### 主要 API 端点

- `POST /api/login` - 用户登录
- `POST /api/register` - 用户注册
- `GET /api/user/list` - 用户列表
- `POST /api/user` - 创建用户
- `PUT /api/user` - 更新用户
- `DELETE /api/user` - 删除用户
- `POST /api/upload` - 文件上传
- `GET /api/upload/list` - 文件列表
- `DELETE /api/upload` - 删除文件

所有 API 都需要 JWT Token 认证（登录接口除外），在请求头中添加：

```
Authorization: Bearer <token>
```

## 🔧 常见问题

### 1. 数据库连接失败

- 检查数据库配置是否正确
- 确认数据库服务是否启动
- 检查网络连接和防火墙设置

### 2. 文件上传失败

- 检查 OSS 配置是否正确
- 确认存储桶权限设置
- 检查文件大小限制

### 3. JWT Token 过期

- Token 默认有效期为 7 天
- 过期后需要重新登录
- 可以在配置中调整过期时间

### 4. 前端无法连接后端

- 检查后端服务是否启动
- 确认 API 地址配置正确
- 检查 CORS 配置

### 5. Docker 部署问题

- 检查 `.env` 文件配置
- 查看容器日志：`docker compose logs`
- 确认端口未被占用

## 📝 数据库备份与恢复

### 备份

```bash
cd deploy/mysql
./backup.sh
```

备份文件保存在 `deploy/mysql/backups/` 目录

### 恢复

```bash
cd deploy/mysql
./restore.sh backups/backup_20240101_120000.sql.gz
```

详细说明请参考 [MySQL 目录说明](deploy/mysql/DIRECTORIES.md)

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

如有问题或建议，请提交 Issue 或联系项目维护者。

---

**注意**: 生产环境部署前，请务必修改默认密码和 JWT 密钥，确保系统安全。

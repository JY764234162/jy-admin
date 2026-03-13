# JY-Admin

基于 **Go(Gin) + React(Vite)** 的全栈后台管理系统。包含用户/角色/菜单权限、文件上传与对象存储、以及多种前端能力演示页（Canvas/编辑器/预览等）。

## 目录

- [项目概览](#项目概览)
- [核心能力](#核心能力)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
  - [后端本地启动](#后端本地启动)
  - [前端本地启动](#前端本地启动)
  - [Docker 一键启动](#docker-一键启动)
- [配置与环境变量](#配置与环境变量)
- [CI/CD 部署](#cicd-部署)
- [接口与文档](#接口与文档)
- [常见问题](#常见问题)

## 项目概览

- **后端**：Gin + GORM + JWT + Zap，支持 MySQL/SQLite，提供 Swagger 文档。
- **前端**：React + TypeScript + Vite + Ant Design + Redux Toolkit，pnpm workspace 管理多包。
- **部署**：根目录 `docker-compose.yml` + `deploy.sh`，可一键启动 MySQL / Backend / Frontend(Nginx)（包含额外 `msfz` 前端服务）。

## 核心能力

- **认证与安全**：JWT、Token 黑名单、验证码、登录安全策略（见后端实现）。
- **权限与菜单**：角色/菜单管理，菜单数据驱动的前端路由与权限可见性。
- **文件与存储**：本地存储与腾讯云 COS（可按配置切换）。
- **工程能力**：前端 monorepo、构建插件化、提交前类型检查、Docker 部署与 GitHub Actions 远程部署。

## 技术栈

### 后端

- Go：`go 1.23`（见 `server/go.mod`）
- Gin：`github.com/gin-gonic/gin`
- GORM：`gorm.io/gorm`（MySQL/SQLite driver）
- JWT：`github.com/golang-jwt/jwt/v5`
- 配置：Viper
- 日志：Zap + lumberjack
- Swagger：swaggo

### 前端

- React 18 + TypeScript
- Vite
- Ant Design
- Redux Toolkit
- React Router DOM
- 包管理：pnpm workspace（见 `web/package.json`）

### 部署

- Docker / Docker Compose
- Nginx（前端容器）
- MySQL 8.0（容器内）

## 目录结构

```text
jy-admin/
├── server/                         # Go 后端
│   ├── api/                        # 业务 API（login/user/menu/authority/upload/customer/ai...）
│   ├── core/                       # 初始化：viper/zap/db/oss/cron/server
│   ├── middleware/                 # jwt/logger/rbac 等中间件
│   ├── model/                      # system 与 business 模型
│   ├── router/                     # 路由注册与分组
│   ├── config.dev.yaml             # 开发配置
│   ├── config.docker.yaml          # Docker 配置（部署依赖）
│   └── main.go
├── web/                            # 前端 monorepo（pnpm workspace）
│   ├── package.json                # workspace scripts（dev/build/type-check）
│   ├── pnpm-workspace.yaml
│   └── packages/
│       ├── web/                    # 主前端应用（Vite）
│       ├── msfz/                   # 额外前端应用（容器中也会启动）
│       └── utils/                  # 共享工具包
├── docker-compose.yml              # 一键启动 MySQL + backend + frontend(+msfz)
├── deploy.sh                       # 一键部署脚本（docker compose up -d --build）
├── init.sql                        # MySQL 初始化脚本
└── README.md
```

## 快速开始

### 后端本地启动

```bash
cd server
go mod download
go run main.go
```

- 默认地址：`http://localhost:7777`
- Swagger：`http://localhost:7777/swagger/index.html`

### 前端本地启动

```bash
cd web
pnpm install
pnpm dev
```

- 默认地址：`http://localhost:5173`

### Docker 一键启动

1) 准备环境变量（本地可以使用根目录 `.env`；服务器/CI 推荐用环境变量注入）

2) 执行部署脚本：

```bash
chmod +x ./deploy.sh
./deploy.sh
```

3) 访问：

- 前端：`http://localhost`
- 后端健康检查：`http://localhost/api/health`

## 配置与环境变量

### 后端配置文件

- `server/config.dev.yaml`：本地开发
- `server/config.docker.yaml`：Docker 部署（`deploy.sh` 会校验该文件存在）

### Docker/CI 常用环境变量

> 以根目录 `docker-compose.yml` 与 `deploy.sh` 为准，下面列出关键项（敏感信息建议用 CI Secrets 注入）。

- **JWT**
  - `JWT_SIGNING_KEY`
- **MySQL**
  - `MYSQL_ROOT_PASSWORD`
  - `MYSQL_DATABASE`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`
- **COS（对象存储）**
  - `COS_SECRET_ID`
  - `COS_SECRET_KEY`
- **AI（可选）**
  - `LONGCAT_APP_KEY`
  - `LONGCAT_MODEL`

## CI/CD 部署

项目提供了 GitHub Actions 工作流：`.github/workflows/deploy.yml`

- 触发：push `main` 或手动触发
- 方式：SSH 到服务器后执行 `git pull` + `./deploy.sh`
- 需要在仓库 Secrets/Vars 中配置服务器连接与环境变量（见 workflow 文件内容）

## 接口与文档

- Swagger：启动后端后访问 `http://localhost:7777/swagger/index.html`
- 通用鉴权：除登录等公共接口外，通常需要在请求头携带：

```text
Authorization: Bearer <token>
```

## 常见问题

### 1) Docker 启动失败/环境变量缺失

- `deploy.sh` 会校验必须的环境变量，缺少会直接退出
- 建议：本地用 `.env`，线上用 GitHub Secrets/环境变量注入

### 2) 前端无法访问后端

- 检查后端容器是否健康：`docker compose ps`
- 查看日志：`docker compose logs -f backend`
- Nginx 反代问题优先检查（buffer/timeout/路径重写）

### 3) 端口占用

- 容器默认占用：`80/443/7777/3306(仅容器内)`，请确保宿主机端口未冲突

---

生产环境部署前请务必修改默认账号密码与 `JWT_SIGNING_KEY`，并妥善管理所有密钥。

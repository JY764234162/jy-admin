# 部署目录

本目录包含所有 Docker 部署相关的配置文件和脚本。

## 目录结构

```
deploy/
├── docker-compose.yml              # 完整部署配置（包含 MySQL）
├── docker-compose.external-mysql.yml  # 使用外部 MySQL 的配置
├── deploy.sh                       # 一键部署脚本
├── README.md                       # 本文件
│
├── web/                            # 前端服务部署配置
│   ├── nginx.conf                  # Nginx 配置文件
│   └── README.md                   # 前端部署说明
│
├── server/                         # 后端服务部署配置
│   ├── Dockerfile                  # 后端 Dockerfile
│   ├── config.docker.yaml          # Docker 环境配置
│   └── README.md                   # 后端部署说明
│
├── mysql/                          # MySQL 服务部署配置
│   ├── init.sql                    # 初始化 SQL 脚本（可选）
│   └── README.md                   # MySQL 部署说明
│
└── [文档文件]
    ├── DEPLOYMENT.md
    ├── DOCKER_DEPLOY.md
    └── DOCKER_DEPLOY_STEPS.md
```

## 使用方法

### 方式一：使用部署脚本（推荐）

```bash
cd deploy
./deploy.sh
```

### 方式二：手动部署

```bash
cd deploy
docker-compose up -d --build
```

## 路径说明

所有路径都是相对于 `deploy/` 目录的：

- `../server` - 后端源代码目录（构建上下文）
- `../web/docs` - 前端构建产物目录
- `./web/nginx.conf` - Nginx 配置文件
- `./server/Dockerfile` - 后端 Dockerfile
- `./mysql/init.sql` - MySQL 初始化脚本

## 配置文件说明

### docker-compose.yml
完整部署配置，包含 MySQL、后端、前端三个服务。

### docker-compose.external-mysql.yml
使用外部 MySQL 的配置，只包含后端和前端服务。

## 注意事项

1. **执行位置**：所有 docker-compose 命令需要在 `deploy/` 目录下执行
2. **构建前准备**：
   - ✅ **前端**：无需手动构建，Docker 会自动构建
   - ✅ **后端**：无需手动构建，Docker 会自动构建
   - ⚠️ **后端配置文件**：`config.docker.yaml` 需要存在于 `../server/` 目录（部署脚本会自动复制）
3. **环境变量**：可以在项目根目录创建 `.env` 文件设置环境变量
4. **数据持久化**：MySQL 数据通过 Docker volume 持久化

## 服务说明

### Web 服务
- 端口：8080（暴露到主机）
- 配置：`web/nginx.conf`
- 静态文件：`../web/docs`

### Server 服务
- 端口：7777（内部，不暴露）
- 构建：使用 `server/Dockerfile`
- 配置：`server/config.docker.yaml`

### MySQL 服务
- 端口：3306（内部，不暴露）
- 数据：通过 volume `mysql_data` 持久化
- 初始化：`mysql/init.sql`（可选）

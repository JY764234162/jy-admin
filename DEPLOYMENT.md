# 部署方案

本文档说明如何将前后端项目部署在一起。

## 方案概述

有两种主要的部署方案：

1. **开发环境**：前后端分离，前端通过 Vite 开发服务器运行，后端独立运行
2. **生产环境**：前端构建后，静态文件由 Go 后端服务提供

## 开发环境部署

### 1. 启动后端服务

```bash
cd server
go run main.go
```

后端将在 `http://localhost:7777` 启动

### 2. 启动前端开发服务器

```bash
cd web/packages/web
pnpm install
pnpm dev
```

前端将在 `http://localhost:5173` 启动（或 Vite 配置的端口）

### 3. 配置环境变量

前端项目需要配置 `.env.development` 文件（已创建）：

```env
VITE_API_BASE_URL=http://localhost:7777
VITE_BASENAME=/
VITE_ROUTE_MODE=history
VITE_STORAGE_PREFIX=jy-admin
```

## 生产环境部署

### 方案一：Go 后端提供静态文件服务

#### 1. 构建前端项目

```bash
cd web/packages/web
pnpm build
```

构建产物将输出到 `web/docs` 目录

#### 2. 修改后端路由配置

在 `server/router/enter.go` 中添加静态文件服务：

```go
// 在 registerRouter 函数中添加
Router.Static("/", "./web/docs")
Router.StaticFile("/", "./web/docs/index.html")
```

#### 3. 配置后端 CORS

生产环境需要允许前端域名访问，修改 `server/router/enter.go` 中的 CORS 配置：

```go
Router.Use(cors.New(cors.Config{
    AllowOrigins:     []string{"https://yourdomain.com"}, // 替换为实际域名
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Content-Length", "Accept-Encoding", "X-CSRF-Token", "Authorization", "Accept", "Cache-Control", "X-Requested-With"},
    ExposeHeaders:    []string{"Content-Length"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
}))
```

#### 4. 构建并运行后端

```bash
cd server
go build -o jy-admin
./jy-admin
```

### 方案二：使用 Nginx 反向代理

#### 1. Nginx 配置示例

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    location / {
        root /path/to/web/docs;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:7777;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 2. 前端环境变量配置

创建 `.env.production` 文件：

```env
VITE_API_BASE_URL=/api
VITE_BASENAME=/
VITE_ROUTE_MODE=history
VITE_STORAGE_PREFIX=jy-admin
```

## Docker 部署（可选）

### Dockerfile 示例

#### 后端 Dockerfile

```dockerfile
# 构建阶段
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY server/ .
RUN go mod download
RUN go build -o jy-admin main.go

# 运行阶段
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/jy-admin .
COPY --from=builder /app/config.yaml .
COPY --from=builder /app/web/docs ./web/docs
EXPOSE 7777
CMD ["./jy-admin"]
```

#### 前端 Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY web/package*.json ./
COPY web/pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install
COPY web/ .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/packages/web/docs /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 注意事项

1. **CORS 配置**：确保后端 CORS 配置允许前端域名访问
2. **路由模式**：如果使用 `history` 模式，需要配置服务器支持 SPA 路由
3. **环境变量**：生产环境需要正确配置前端环境变量
4. **静态文件路径**：确保后端能够正确访问前端构建产物
5. **数据库**：生产环境建议使用 MySQL 或 PostgreSQL，而不是 SQLite

## 快速启动脚本

### 开发环境启动脚本

创建 `start-dev.sh`：

```bash
#!/bin/bash

# 启动后端
cd server
go run main.go &
BACKEND_PID=$!

# 等待后端启动
sleep 2

# 启动前端
cd ../web/packages/web
pnpm dev &
FRONTEND_PID=$!

echo "后端 PID: $BACKEND_PID"
echo "前端 PID: $FRONTEND_PID"
echo "按 Ctrl+C 停止服务"

# 等待中断信号
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
```

### 生产环境启动脚本

创建 `start-prod.sh`：

```bash
#!/bin/bash

# 构建前端
cd web/packages/web
pnpm build

# 启动后端
cd ../../server
go run main.go
```


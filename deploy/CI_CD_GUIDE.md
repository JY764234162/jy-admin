# CI/CD 部署指南

## 📋 概述

本指南说明如何设置 CI/CD 自动化部署，以及代码更新后的部署流程。

## 🚀 部署方式

### 方式一：GitHub Actions（推荐）

#### 1. 设置 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

- `SSH_PRIVATE_KEY`: 服务器 SSH 私钥
- `SSH_USER`: SSH 用户名（如 `root`）
- `SSH_HOST`: 服务器 IP 或域名
- `JWT_SIGNING_KEY`: JWT 密钥（可选）
- `MYSQL_PASSWORD`: MySQL 密码（可选）

#### 2. 配置工作流

已创建 `.github/workflows/deploy.yml`，包含：
- 代码推送时自动构建
- 推送到 main/master 分支时自动部署

#### 3. 服务器端准备

在服务器上：

```bash
# 1. 克隆项目
git clone <your-repo-url> /path/to/jy-admin
cd /path/to/jy-admin

# 2. 创建 .env 文件
cat > .env << EOF
JWT_SIGNING_KEY=your-production-secret-key
MYSQL_PASSWORD=your-mysql-password
EOF

# 3. 确保 SSH 密钥已配置
```

#### 4. 工作流程

```
代码推送 → GitHub Actions 触发
    ↓
构建 Docker 镜像
    ↓
SSH 连接到服务器
    ↓
拉取最新代码
    ↓
执行 docker-compose up -d --build
    ↓
服务更新完成
```

### 方式二：手动部署

#### 1. 本地构建并推送镜像（可选）

```bash
# 构建镜像
docker build -t jy-admin-backend:latest -f deploy/server/Dockerfile server/
docker build -t jy-admin-frontend:latest -f deploy/web/Dockerfile web/

# 推送到镜像仓库（如 Docker Hub）
docker tag jy-admin-backend:latest your-username/jy-admin-backend:latest
docker push your-username/jy-admin-backend:latest
```

#### 2. 服务器上更新

```bash
# SSH 连接到服务器
ssh user@your-server

# 进入项目目录
cd /path/to/jy-admin

# 拉取最新代码
git pull origin main

# 更新服务
cd deploy
./update.sh
# 或
docker-compose up -d --build
```

### 方式三：使用部署脚本

#### 服务器端脚本

```bash
#!/bin/bash
# /path/to/jy-admin/deploy/auto-update.sh

cd /path/to/jy-admin
git pull origin main
cd deploy
docker-compose up -d --build
```

#### 设置定时检查（可选）

```bash
# 添加到 crontab，每 5 分钟检查一次
*/5 * * * * /path/to/jy-admin/deploy/auto-update.sh
```

## 🔄 代码更新流程

### 场景 1: 本地开发后更新

```bash
# 1. 提交代码
git add .
git commit -m "更新功能"
git push origin main

# 2. 如果配置了 CI/CD，会自动部署
# 3. 如果没有，手动部署：
ssh user@server
cd /path/to/jy-admin
git pull
cd deploy
docker-compose up -d --build
```

### 场景 2: 只更新配置

```bash
# 修改配置文件后
cd deploy
docker-compose restart backend  # 只重启后端
# 或
docker-compose up -d --build backend  # 重新构建后端
```

### 场景 3: 只更新前端

```bash
cd deploy
docker-compose up -d --build frontend
```

### 场景 4: 只更新后端

```bash
cd deploy
docker-compose up -d --build backend
```

## 📝 GitHub Actions 配置说明

### deploy.yml

- **触发条件**: 推送到 main/master 分支
- **构建**: 使用 Docker BuildKit
- **部署**: SSH 连接到服务器执行更新

### 自定义配置

修改 `.github/workflows/deploy.yml`：

```yaml
# 修改服务器路径
cd /path/to/jy-admin  # 改为你的实际路径

# 修改分支
branches:
  - main  # 改为你的主分支
```

## 🔧 服务器端配置

### 1. 安装必要工具

```bash
# 安装 Docker 和 Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 配置 SSH 密钥

```bash
# 在服务器上
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 在本地生成密钥对（如果没有）
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# 复制公钥到服务器
ssh-copy-id user@your-server

# 测试连接
ssh user@your-server
```

### 3. 设置环境变量

在服务器上创建 `.env` 文件：

```bash
cd /path/to/jy-admin
cat > .env << EOF
JWT_SIGNING_KEY=your-production-secret-key
MYSQL_PASSWORD=your-mysql-password
EOF
```

## 🚨 注意事项

1. **首次部署**: 需要手动执行一次 `docker-compose up -d --build`
2. **数据备份**: 更新前建议备份 MySQL 数据
3. **零停机更新**: 使用 `docker-compose up -d --build` 可以实现零停机更新
4. **回滚**: 如果更新失败，可以回滚到之前的版本

```bash
# 回滚到之前的镜像
docker-compose pull
docker-compose up -d
```

## 📊 监控和日志

### 查看服务状态

```bash
docker-compose ps
```

### 查看日志

```bash
# 所有服务日志
docker-compose logs -f

# 特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 健康检查

```bash
# 检查后端健康
curl http://localhost:8080/api/health

# 检查前端
curl http://localhost:8080
```

## 🔐 安全建议

1. **使用 Secrets**: 敏感信息通过 GitHub Secrets 传递
2. **SSH 密钥**: 使用 SSH 密钥而不是密码
3. **防火墙**: 只开放必要端口（8080）
4. **定期更新**: 定期更新 Docker 镜像和依赖

## 📚 相关文件

- `.github/workflows/deploy.yml` - GitHub Actions 工作流
- `deploy/update.sh` - 更新脚本
- `deploy/deploy.sh` - 部署脚本


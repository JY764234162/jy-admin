# Web 前端部署配置

本目录包含前端服务的部署相关文件。

## 文件说明

- `Dockerfile` - 前端服务的 Docker 镜像构建文件（多阶段构建）
- `nginx.conf` - Nginx 反向代理配置文件

## Dockerfile 说明

采用 4 层构建模式，优化缓存和构建速度：

### 1. base 层（基础环境）
- 使用 `node:20-slim` 作为基础镜像
- 启用 corepack（内置 pnpm 支持）
- 复制 package 文件和源代码

### 2. prod-deps 层（生产依赖）
- 只安装生产依赖
- 使用 Docker BuildKit 缓存（`--mount=type=cache`）
- 优化后续构建速度

### 3. build 层（构建）
- 从 prod-deps 层复制 node_modules（缓存优化）
- 安装开发依赖
- 执行构建命令

### 4. 运行层（Nginx）
- 使用 `nginx:alpine` 作为运行环境
- 复制构建产物到 Nginx 目录
- 复制 Nginx 配置文件

## 构建优化

### Docker BuildKit 缓存
使用 `--mount=type=cache` 缓存 pnpm store，大幅提升构建速度：

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1
docker-compose build
```

### CI/CD 环境变量
在 CI/CD 中设置：
```yaml
variables:
  DOCKER_BUILDKIT: 1
```

## 使用说明

### 自动构建

前端会在 Docker 构建时自动构建，无需手动执行 `pnpm build`：

```bash
cd deploy
docker-compose up -d --build
```

### 构建上下文

Dockerfile 的构建上下文是 `../web`（web 根目录），包含：
- `package.json` - 根 package.json
- `pnpm-lock.yaml` - 锁文件
- `pnpm-workspace.yaml` - workspace 配置
- `packages/` - 所有 packages

### 构建产物

构建产物会输出到 `web/docs` 目录，然后复制到 Nginx 容器的 `/usr/share/nginx/html`。

## 注意事项

1. **构建时间**：首次构建可能需要较长时间（下载依赖）
2. **缓存优化**：Docker 会缓存依赖安装层，后续构建会更快
3. **环境变量**：前端构建时的环境变量通过 `.env` 文件或构建参数传递

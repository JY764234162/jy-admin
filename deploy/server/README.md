# Server 部署配置

本目录包含后端服务的部署相关文件。

## 文件说明

- `Dockerfile` - 后端服务的 Docker 镜像构建文件
- `config.docker.yaml` - Docker 环境的后端配置文件

## 使用说明

### 构建前准备

在构建 Docker 镜像前，需要将 `config.docker.yaml` 复制到 `server/` 目录，或者通过 docker-compose 的构建参数传递。

### 配置文件

`config.docker.yaml` 是专门为 Docker 环境准备的配置文件，包含：
- MySQL 连接配置（使用容器名 `mysql`）
- 日志配置（JSON 格式，文件输出）
- 生产环境安全设置

### 注意事项

1. **构建上下文**：Docker 构建上下文是 `../server`（源代码目录）
2. **配置文件路径**：Dockerfile 中的 COPY 路径是相对于构建上下文的
3. **环境变量**：可以通过 docker-compose 的环境变量覆盖配置


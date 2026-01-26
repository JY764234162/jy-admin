# 构建阶段
FROM golang:1.23-alpine AS builder

WORKDIR /app

# 复制 go mod 文件
COPY go.mod go.sum ./
# 配置国内代理
RUN go env -w GOPROXY=https://goproxy.cn,direct
RUN go mod download

# 复制源代码
COPY . .

# 构建应用（禁用 CGO，静态链接）
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64
RUN go build -ldflags="-w -s" -o jy-admin main.go

# 运行阶段
FROM alpine:latest

# 安装必要的工具
RUN apk --no-cache add ca-certificates tzdata

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制可执行文件
COPY --from=builder /app/jy-admin .

# 复制配置文件（构建时从构建上下文复制）
# 注意：config.docker.yaml 需要在构建前复制到 server 目录
# 如果文件不存在，使用空文件作为占位符（避免构建失败）
COPY config.docker.yaml* ./
RUN if [ ! -f config.docker.yaml ]; then \
      echo "警告: config.docker.yaml 不存在，将使用默认配置"; \
      touch config.docker.yaml; \
    fi

# 创建必要的目录
RUN mkdir -p /app/data /app/uploads /app/logs

# 暴露端口（内部使用，不映射到主机）
EXPOSE 7777

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7777/api/health || exit 1

# 运行应用
CMD ["./jy-admin"]


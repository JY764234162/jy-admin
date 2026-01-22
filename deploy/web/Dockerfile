# 如果需要用 CI/CD，请设置环境变量：
# variables:
#   DOCKER_BUILDKIT: 1

# 基础层：设置环境
FROM node:20-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 启用 corepack（内置 pnpm 支持）
RUN corepack enable

WORKDIR /app

# 复制 package 文件（web 根目录）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制 packages 目录结构
COPY packages ./packages

# 依赖层：安装所有依赖（workspace 项目需要完整依赖）
FROM base AS deps

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 构建层：构建前端项目
FROM base AS build

# 从依赖层复制 node_modules（缓存优化）
COPY --from=deps /app/node_modules /app/node_modules

# 设置 Node.js 内存限制（避免 OOM，4GB）
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 构建前端（分步执行，便于调试）
RUN cd packages/web && \
    echo "Starting build..." && \
    pnpm build

# 运行层：Nginx 服务
FROM nginx:alpine

LABEL MAINTAINER="jy-admin"

# 复制 Nginx 配置（nginx.conf 需要放在 web 根目录）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建层复制构建产物（构建产物在 web/docs）
COPY --from=build /app/docs /usr/share/nginx/html

# 验证构建产物
RUN ls -al /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]


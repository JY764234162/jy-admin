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

# 依赖层：只复制依赖文件，最大化缓存利用
FROM base AS deps

# 先复制根目录的 package 文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./



# 安装依赖（使用缓存挂载加速）
# 配置国内代理
RUN pnpm config set registry https://registry.npmmirror.com
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 构建层：构建前端项目
FROM base AS build

# 复制所有配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制所有源代码（.dockerignore 会排除 node_modules）
COPY packages ./packages

# 配置 pnpm 使用国内镜像
RUN pnpm config set registry https://registry.npmmirror.com

# 安装依赖（使用缓存挂载加速，会利用 deps 层已下载的包）
# 这样可以确保所有 workspace 依赖和链接都正确
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile


# 构建前端（分离 TypeScript 编译和 Vite 构建，确保内存释放）
# 先编译 TypeScript，然后单独运行 Vite 构建
RUN cd packages/msfz && \
    pnpm exec vite build

# 运行层：Nginx 服务
FROM nginx:alpine

LABEL MAINTAINER="jy-admin"

# 复制 Nginx 配置（此 Dockerfile 位于 packages/msfz，下方路径基于构建上下文：msfz 根目录）
COPY packages/msfz/nginx.conf /etc/nginx/conf.d/default.conf

# 从构建层复制构建产物（构建产物在 msfz/packages/msfz/dist，对应构建阶段的 /app/packages/msfz/dist）
COPY --from=build /app/packages/msfz/dist /usr/share/nginx/html

# 验证构建产物
RUN ls -al /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]


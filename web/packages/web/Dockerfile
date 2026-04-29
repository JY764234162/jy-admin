# ============================================================
# 纯部署版 Dockerfile（本地构建产物 → Nginx）
# 用法：
#   1. 本地执行：cd web/packages/web && pnpm build
#   2. Docker 构建：docker-compose up --build frontend
# ============================================================

FROM nginx:alpine

LABEL MAINTAINER="jy-admin"

# 复制 Nginx 配置（构建上下文为 web 根目录）
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

# 复制本地构建产物（需先在本地执行 pnpm build）
COPY packages/web/dist /usr/share/nginx/html

# 验证构建产物存在
RUN ls -al /usr/share/nginx/html/index.html || (echo "错误：未找到构建产物，请先执行 pnpm build" && exit 1)

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]

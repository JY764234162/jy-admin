#!/bin/bash
#
# 本地部署脚本（在 Mac/开发机运行）
# 功能：本地 build 前端 → 传产物到服务器 → 服务器 reload
#
# 用法：
#   1. 修改下方 SERVER_HOST / SERVER_PATH / SERVER_USER
#   2. chmod +x deploy-local.sh
#   3. ./deploy-local.sh
#

set -e

# ==================== 配置（请按需修改） ====================
SERVER_HOST="101.42.138.198"      # 服务器 IP 或域名
SERVER_USER="ubuntu"                # SSH 用户名
SERVER_PATH="/home/ubuntu/jy_admin"       # 服务器上项目路径
# ============================================================

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== JY-Admin 本地部署 ===${NC}\n"

# 检查是否配置了服务器
if [ "$SERVER_HOST" = "your-server-ip" ]; then
    echo -e "${RED}错误: 请先修改脚本中的 SERVER_HOST / SERVER_USER / SERVER_PATH${NC}"
    echo -e "${YELLOW}提示: 用编辑器打开 deploy-local.sh，修改顶部配置${NC}"
    exit 1
fi

# 检查本地构建产物是否存在
if [ ! -d "web/packages/web/dist" ] || [ ! -f "web/packages/web/dist/index.html" ]; then
    echo -e "${YELLOW}未找到构建产物，开始本地构建...${NC}"
    cd web/packages/web
    pnpm build
    cd ../../..
else
    echo -e "${GREEN}✓ 构建产物已存在${NC}"
    # 非交互环境默认不重新构建
    if [ -t 0 ]; then
        read -r -p "是否重新构建? [y/N] " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            cd web/packages/web
            pnpm build
            cd ../../..
        fi
    else
        echo -e "${YELLOW}非交互环境，跳过重新构建（如需重新构建请手动执行 pnpm build）${NC}"
    fi
fi

# 确保服务器上目录存在
echo -e "\n${BLUE}确保服务器目录存在...${NC}"
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${SERVER_PATH}/web/packages/web/dist"

# 上传前端产物到服务器
echo -e "\n${BLUE}上传前端产物到服务器...${NC}"
rsync -avz --delete \
    web/packages/web/dist/ \
    "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/web/packages/web/dist/"

# 上传 Nginx 配置
echo -e "\n${BLUE}上传 Nginx 配置...${NC}"
rsync -avz \
    web/packages/web/nginx.conf \
    "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/web/packages/web/nginx.conf"

# 服务器端部署
echo -e "\n${BLUE}服务器端部署...${NC}"
ssh "${SERVER_USER}@${SERVER_HOST}" << EOF
    set -e
    cd "${SERVER_PATH}"

    echo "启动后端服务..."
    docker compose up -d backend mysql

    echo "前端 Nginx 重载..."
    if docker ps --format '{{.Names}}' | grep -q '^jy-admin-frontend$'; then
        docker exec jy-admin-frontend nginx -s reload
        echo "前端已重载"
    else
        echo "前端容器未运行，尝试启动..."
        docker compose up -d frontend
    fi

    echo "服务状态:"
    docker compose ps
EOF

echo -e "\n${GREEN}✓ 部署完成！${NC}"
echo ""
echo -e "${BLUE}访问地址：${NC}"
echo "  前端: http://${SERVER_HOST}"
echo "  API:  http://${SERVER_HOST}/api/health"

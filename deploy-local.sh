#!/bin/bash
#
# 本地部署脚本（在 Mac/开发机运行）
# 功能：本地 build 前端 → 本地 docker compose → 可选推送到远程服务器
#
# 用法：
#   chmod +x deploy-local.sh
#   ./deploy-local.sh
#

set -e

# ==================== 远程服务器配置 ====================
SERVER_HOST="101.42.138.198"
SERVER_USER="ubuntu"
SERVER_PATH="/home/ubuntu/jy_admin"
# ============================================================

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== JY-Admin 本地 Docker 部署 ===${NC}\n"

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未安装 Docker${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    echo -e "${RED}错误: 未安装 Docker Compose${NC}"
    exit 1
fi

# 清理虚悬镜像（dangling images）
echo -e "\n${BLUE}清理虚悬镜像...${NC}"
DANGLING_IMAGES=$(docker images -f "dangling=true" -q)
if [ -z "$DANGLING_IMAGES" ]; then
    echo -e "${GREEN}✓ 没有虚悬镜像需要清理${NC}"
else
    DANGLING_COUNT=$(echo "$DANGLING_IMAGES" | wc -l | tr -d ' ')
    echo -e "${YELLOW}发现 $DANGLING_COUNT 个虚悬镜像，正在清理...${NC}"
    docker image prune -f > /dev/null
    echo -e "${GREEN}✓ 虚悬镜像清理完成${NC}"
fi

# 检查 .env
if [ -f ".env" ]; then
    source .env 2>/dev/null || true
    echo -e "${GREEN}✓ 已加载 .env${NC}"
else
    echo -e "${YELLOW}提示: 未找到 .env，将仅使用当前环境变量${NC}"
fi

# 本地构建前端
echo -e "\n${BLUE}检查前端构建产物...${NC}"

if [ -d "web/packages/web/dist" ] && [ -f "web/packages/web/dist/index.html" ]; then
    echo -e "${GREEN}✓ 构建产物已存在${NC}"
    if [ -t 0 ]; then
        read -r -p "是否重新构建? [Y/N] " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}跳过构建，使用已有产物${NC}"
            SKIP_BUILD=1
        fi
    else
        echo -e "${YELLOW}非交互环境，跳过重新构建${NC}"
        SKIP_BUILD=1
    fi
else
    echo -e "${YELLOW}未找到构建产物，需要执行构建${NC}"
fi

if [ -z "$SKIP_BUILD" ]; then
    cd web/packages/web

    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}错误: 未安装 pnpm${NC}"
        exit 1
    fi

    echo -e "${BLUE}开始构建前端...${NC}"
    pnpm build

    cd ../../..
fi

# 启动本地 Docker 服务
echo -e "\n${BLUE}启动本地 Docker 服务...${NC}"

COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

FRONTEND_RUNNING=$(docker ps --format '{{.Names}}' | grep -c '^jy-admin-frontend$' || true)
if [ "$FRONTEND_RUNNING" -eq 0 ]; then
    echo -e "${YELLOW}服务未运行，构建并启动所有服务...${NC}"
    $COMPOSE_CMD up -d --build
elif [ -z "$SKIP_BUILD" ]; then
    echo -e "${YELLOW}前端已重新构建，重建前端镜像...${NC}"
    $COMPOSE_CMD up -d --build --force-recreate frontend
else
    # 前端未重新构建，默认重建后端
    echo -e "${YELLOW}重建后端镜像并启动所有服务...${NC}"
    $COMPOSE_CMD up -d --build
fi

echo -e "\n${GREEN}✓ 本地部署完成！${NC}\n"

# 显示服务状态
echo -e "${BLUE}服务状态：${NC}"
$COMPOSE_CMD ps

echo ""
echo -e "${GREEN}本地访问地址：${NC}"
echo "  前端: http://localhost"
echo "  API:  http://localhost/api/health"

# 询问是否推送到远程服务器
if [ -t 0 ]; then
    echo ""
    read -r -p "是否推送前端产物到远程服务器 (${SERVER_USER}@${SERVER_HOST})? [y/N] " push_confirm
    if [[ "$push_confirm" =~ ^[Yy]$ ]]; then
        echo -e "\n${BLUE}推送前端产物到远程服务器...${NC}"

        ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${SERVER_PATH}/web/packages/web/dist"

        rsync -avz --delete \
            web/packages/web/dist/ \
            "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/web/packages/web/dist/"

        echo -e "${GREEN}✓ 前端产物已推送到远程服务器${NC}"
        echo -e "${YELLOW}提示: 请在服务器上执行 ./deploy.sh 完成部署${NC}"
    else
        echo -e "${YELLOW}跳过远程推送${NC}"
    fi
fi

echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看日志: docker compose logs -f"
echo "  停止服务: docker compose down"
echo "  重启服务: docker compose restart"

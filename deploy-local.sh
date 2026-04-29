#!/bin/bash
#
# 本地部署脚本（在 Mac/开发机运行）
# 功能：本地 build 前端 → 本地 docker compose 启动所有服务
#
# 用法：
#   chmod +x deploy-local.sh
#   ./deploy-local.sh
#

set -e

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
    # 非交互环境默认不重新构建
    if [ -t 0 ]; then
        read -r -p "是否重新构建? [y/N] " confirm
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

if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

echo -e "\n${GREEN}✓ 本地部署完成！${NC}\n"

# 显示服务状态
echo -e "${BLUE}服务状态：${NC}"
if docker compose version &> /dev/null; then
    docker compose ps
else
    docker-compose ps
fi

echo ""
echo -e "${GREEN}访问地址：${NC}"
echo "  前端: http://localhost"
echo "  API:  http://localhost/api/health"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看日志: docker compose logs -f"
echo "  停止服务: docker compose down"
echo "  重启服务: docker compose restart"

#!/bin/bash

# 更新部署脚本
# 使用方法: ./update.sh

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 更新 JY-Admin 服务 ===${NC}\n"

# 检查是否在 deploy 目录
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}错误: 请在 deploy 目录下执行此脚本${NC}"
    exit 1
fi

# 启用 BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# 选择更新方式
echo "请选择更新方式："
echo "1. 只更新代码，不重新构建（快速）"
echo "2. 重新构建并更新（完整更新）"
read -p "请选择 (1/2): " choice

case $choice in
    1)
        echo -e "\n${GREEN}快速更新：重启服务${NC}\n"
        if docker compose version &> /dev/null; then
            docker compose restart
        else
            docker-compose restart
        fi
        ;;
    2)
        echo -e "\n${GREEN}完整更新：重新构建并启动${NC}\n"
        if docker compose version &> /dev/null; then
            docker compose up -d --build
        else
            docker-compose up -d --build
        fi
        ;;
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✓ 更新完成！${NC}\n"

# 显示服务状态
echo -e "${BLUE}服务状态：${NC}"
if docker compose version &> /dev/null; then
    docker compose ps
else
    docker-compose ps
fi

# 显示日志
echo ""
echo -e "${BLUE}查看日志：${NC}"
echo "  docker-compose logs -f"


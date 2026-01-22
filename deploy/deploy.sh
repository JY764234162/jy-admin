#!/bin/bash

# Docker 部署脚本
# 使用方法: ./deploy.sh

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== JY-Admin Docker 部署 ===${NC}\n"

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未安装 Docker${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}错误: 未安装 Docker Compose${NC}"
    exit 1
fi

# 检查并复制配置文件
if [ ! -f "../server/config.docker.yaml" ]; then
    if [ -f "./server/config.docker.yaml" ]; then
        echo -e "${YELLOW}复制配置文件到 server 目录...${NC}"
        cp ./server/config.docker.yaml ../server/config.docker.yaml
        echo -e "${GREEN}✓ 配置文件已复制${NC}\n"
    else
        echo -e "${RED}错误: config.docker.yaml 不存在${NC}"
        echo -e "${RED}请确保 deploy/server/config.docker.yaml 存在${NC}"
        exit 1
    fi
fi

# 检查环境变量
if [ -z "$JWT_SIGNING_KEY" ]; then
    echo -e "${YELLOW}警告: 未设置 JWT_SIGNING_KEY 环境变量${NC}"
    echo -e "${YELLOW}建议: export JWT_SIGNING_KEY=\"your-secret-key\"${NC}\n"
fi

# 启用 BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# 构建和启动
echo -e "\n${BLUE}开始构建和启动服务...${NC}\n"

if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

echo -e "\n${GREEN}✓ 部署完成！${NC}\n"

# 显示服务状态
echo -e "${BLUE}服务状态：${NC}"
if docker compose version &> /dev/null; then
    docker compose ps
else
    docker-compose ps
fi

echo ""
echo -e "${GREEN}访问地址：${NC}"
echo "  前端: http://localhost:8080"
echo "  健康检查: http://localhost:8080/api/health"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"


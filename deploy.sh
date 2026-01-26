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

# 检查配置文件
if [ ! -f "server/config.docker.yaml" ]; then
    echo -e "${RED}错误: server/config.docker.yaml 不存在${NC}"
    echo -e "${RED}请创建 server/config.docker.yaml 配置文件${NC}"
    exit 1
fi

# 检查并创建 .env 文件
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}创建 .env 文件...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✓ .env 文件已创建${NC}"
        echo -e "${YELLOW}⚠️  请编辑 .env 文件，填写实际的环境变量值${NC}"
        echo -e "${YELLOW}   然后重新运行此脚本${NC}\n"
        exit 1
    else
        echo -e "${RED}错误: .env.example 文件不存在${NC}"
        echo -e "${RED}请创建 .env 文件并设置必要的环境变量${NC}"
        exit 1
    fi
fi

# 检查必要的环境变量是否已设置（从 .env 文件读取）
source .env 2>/dev/null || true

# 检查关键环境变量（只检查是否为空，不检查默认值）
MISSING_VARS=()
if [ -z "$JWT_SIGNING_KEY" ]; then
    MISSING_VARS+=("JWT_SIGNING_KEY")
fi
if [ -z "$MYSQL_PASSWORD" ]; then
    MISSING_VARS+=("MYSQL_PASSWORD")
fi
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    MISSING_VARS+=("MYSQL_ROOT_PASSWORD")
fi
if [ -z "$MYSQL_DATABASE" ]; then
    MISSING_VARS+=("MYSQL_DATABASE")
fi
if [ -z "$MYSQL_USER" ]; then
    MISSING_VARS+=("MYSQL_USER")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}错误: 以下环境变量未设置：${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}  - $var${NC}"
    done
    echo -e "${YELLOW}请编辑 .env 文件，设置这些环境变量${NC}"
    echo -e "${YELLOW}可以参考 .env.example 文件${NC}\n"
    exit 1
fi

# 检查是否使用默认值（仅警告，不阻止部署）
WARNING_VARS=()
if [ "$JWT_SIGNING_KEY" = "change-this-secret-key" ]; then
    WARNING_VARS+=("JWT_SIGNING_KEY")
fi

if [ ${#WARNING_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}警告: 以下环境变量使用了默认值，建议修改为实际值：${NC}"
    for var in "${WARNING_VARS[@]}"; do
        echo -e "${YELLOW}  - $var${NC}"
    done
    echo -e "${YELLOW}建议: 编辑 .env 文件，设置实际的值以提高安全性${NC}\n"
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


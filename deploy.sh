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

# 读取 .env（可选）
# - 本地开发：通常会有 .env
# - CI/CD/服务器：推荐由外部环境变量注入敏感信息，此时 .env 可以不存在
if [ -f ".env" ]; then
    # shellcheck disable=SC1091
    source .env 2>/dev/null || true
else
    echo -e "${YELLOW}提示: 未找到 .env，将仅使用当前环境变量进行部署${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}  可参考 .env.example 创建本地 .env（本地开发推荐）${NC}"
    fi
fi

# 检查关键环境变量（只检查是否为空，不检查默认值）
# - 必填：MySQL + JWT（服务启动必需）
# - 条件必填：当 oss-type=tencent-cos 时，COS 配置必填
# - 可选：LongCat（不填则后端回退到 Mock）
MISSING_VARS=()

# 必填：数据库与 JWT与COS与LongCat
REQUIRED_VARS=(
    JWT_SIGNING_KEY
    MYSQL_ROOT_PASSWORD
    MYSQL_DATABASE
    MYSQL_USER
    MYSQL_PASSWORD
    COS_SECRET_ID
    COS_SECRET_KEY
    LONGCAT_APP_KEY
    LONGCAT_MODEL
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        MISSING_VARS+=("$var")
    fi
done



if [ ${#MISSING_VARS[@]} -gt 0 ]; then 
    echo -e "${RED}错误: 以下环境变量未设置：${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}  - $var${NC}"
    done
    echo -e "${YELLOW}请通过以下任一方式设置这些环境变量：${NC}"
    echo -e "${YELLOW}  1) 本地创建/编辑 .env 文件（可参考 .env.example）${NC}"
    echo -e "${YELLOW}  2) 在执行脚本前导出环境变量（export XXX=...）${NC}"
    echo -e "${YELLOW}  3) 在 CI/CD 中注入 Secrets/环境变量到服务器执行环境${NC}\n"
    exit 1
fi


# 启用 BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

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
echo "  前端: http://localhost"
echo "  健康检查: http://localhost/api/health"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"


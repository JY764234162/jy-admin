#!/bin/bash

# 监控前端构建时的内存占用
# 使用方法: ./monitor-build.sh

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 前端构建内存监控 ===${NC}\n"

# 检查是否在 web 目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 请在 web 目录下运行此脚本${NC}"
    exit 1
fi

# 获取当前进程的 PID（用于监控）
SCRIPT_PID=$$

# 创建临时文件存储内存数据
MEM_LOG=$(mktemp)
PEAK_MEM=0
PEAK_MEM_TIME=""

# 内存监控函数（后台运行）
monitor_memory() {
    local build_pid=$1
    local start_time=$(date +%s)
    
    echo -e "${BLUE}开始监控内存使用...${NC}\n"
    
    while kill -0 $build_pid 2>/dev/null; do
        # 获取构建进程及其子进程的内存使用（RSS，单位 KB）
        local mem_kb=$(ps -o pid,rss --ppid $build_pid 2>/dev/null | tail -n +2 | awk '{sum+=$2} END {print sum}')
        
        # 如果没有子进程，尝试直接获取进程内存
        if [ -z "$mem_kb" ] || [ "$mem_kb" = "0" ]; then
            mem_kb=$(ps -o rss -p $build_pid 2>/dev/null | tail -n +1 | awk '{print $1}')
        fi
        
        if [ -n "$mem_kb" ] && [ "$mem_kb" != "0" ]; then
            # 转换为 MB
            local mem_mb=$((mem_kb / 1024))
            local current_time=$(date +%s)
            local elapsed=$((current_time - start_time))
            
            # 记录到日志文件
            echo "$elapsed,$mem_mb" >> "$MEM_LOG"
            
            # 更新峰值内存
            if [ $mem_mb -gt $PEAK_MEM ]; then
                PEAK_MEM=$mem_mb
                PEAK_MEM_TIME=$elapsed
            fi
            
            # 实时显示（每秒更新）
            printf "\r${YELLOW}运行时间: %ds | 当前内存: %d MB | 峰值内存: %d MB${NC}" $elapsed $mem_mb $PEAK_MEM
        fi
        
        sleep 1
    done
    
    echo "" # 换行
}

# 使用更精确的方法监控 Node.js 进程
monitor_node_memory() {
    local build_pid=$1
    local start_time=$(date +%s)
    
    echo -e "${BLUE}开始监控 Node.js 内存使用...${NC}\n"
    
    while kill -0 $build_pid 2>/dev/null; do
        # 方法1: 获取构建进程及其所有子进程的内存（RSS，单位 KB）
        local mem_kb=$(ps -o rss --ppid $build_pid 2>/dev/null | tail -n +2 | awk '{sum+=$1} END {print sum+0}')
        
        # 方法2: 如果方法1失败，查找所有 Node.js/pnpm 相关进程
        if [ -z "$mem_kb" ] || [ "$mem_kb" = "0" ]; then
            # 获取当前用户的所有 node/pnpm 进程内存
            mem_kb=$(ps aux | grep -E "^$(whoami).*node|^$(whoami).*pnpm" | grep -v grep | awk '{sum+=$6} END {print sum+0}')
        fi
        
        # 方法3: 如果还是失败，尝试直接获取进程内存
        if [ -z "$mem_kb" ] || [ "$mem_kb" = "0" ]; then
            mem_kb=$(ps -o rss -p $build_pid 2>/dev/null | tail -n +1 | awk '{print $1+0}')
        fi
        
        if [ -n "$mem_kb" ] && [ "$mem_kb" != "0" ]; then
            # 转换为 MB
            local mem_mb=$((mem_kb / 1024))
            local current_time=$(date +%s)
            local elapsed=$((current_time - start_time))
            
            # 记录到日志文件
            echo "$elapsed,$mem_mb" >> "$MEM_LOG"
            
            # 更新峰值内存
            if [ $mem_mb -gt $PEAK_MEM ]; then
                PEAK_MEM=$mem_mb
                PEAK_MEM_TIME=$elapsed
            fi
            
            # 实时显示
            printf "\r${YELLOW}运行时间: %ds | 当前内存: %d MB | 峰值内存: %d MB${NC}" $elapsed $mem_mb $PEAK_MEM
        fi
        
        sleep 1
    done
    
    echo "" # 换行
}

# 显示构建前后的系统内存
echo -e "${BLUE}构建前系统内存状态：${NC}"
free -h | grep -E "Mem|Swap"

echo ""

# 记录开始时间
START_TIME=$(date +%s)

# 启动构建命令（后台运行）
echo -e "${BLUE}开始执行构建命令...${NC}"
pnpm run build &
BUILD_PID=$!

# 启动内存监控（后台运行）
monitor_node_memory $BUILD_PID &
MONITOR_PID=$!

# 等待构建完成
wait $BUILD_PID
BUILD_EXIT_CODE=$?

# 停止监控
kill $MONITOR_PID 2>/dev/null || true

# 计算总耗时
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo ""
echo -e "${BLUE}构建后系统内存状态：${NC}"
free -h | grep -E "Mem|Swap"

echo ""
echo -e "${GREEN}=== 构建完成 ===${NC}"
echo -e "总耗时: ${TOTAL_TIME} 秒"
echo -e "峰值内存: ${PEAK_MEM} MB ($(awk "BEGIN {printf \"%.2f\", $PEAK_MEM/1024}") GB)"
if [ -n "$PEAK_MEM_TIME" ]; then
    echo -e "峰值内存出现时间: ${PEAK_MEM_TIME} 秒"
fi

# 显示内存使用趋势（如果有数据）
if [ -s "$MEM_LOG" ]; then
    echo ""
    echo -e "${BLUE}内存使用趋势（前10个采样点）：${NC}"
    head -10 "$MEM_LOG" | awk -F',' '{printf "  %ds: %d MB\n", $1, $2}'
    
    # 计算平均内存
    AVG_MEM=$(awk -F',' '{sum+=$2; count++} END {if(count>0) print int(sum/count); else print 0}' "$MEM_LOG")
    echo -e "${BLUE}平均内存使用: ${AVG_MEM} MB${NC}"
fi

# 清理临时文件
rm -f "$MEM_LOG"

# 返回构建退出码
exit $BUILD_EXIT_CODE


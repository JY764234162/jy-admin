# 构建问题排查

## 退出代码 134

退出代码 134 通常表示进程被 SIGABRT 终止，可能的原因：

### 1. 内存不足（OOM）

**解决方案：**
- 已设置 `NODE_OPTIONS="--max-old-space-size=4096"`（4GB）
- 如果还不够，可以增加到 8192（8GB）

**检查 Docker 资源：**
```bash
docker system df
docker stats
```

**增加 Docker 内存限制：**
- Docker Desktop: Settings → Resources → Memory
- 建议至少 4GB，推荐 8GB

### 2. 构建超时

**解决方案：**
增加构建超时时间或分步构建。

### 3. 依赖问题

**检查：**
```bash
# 在本地测试构建
cd web/packages/web
pnpm install
pnpm build
```

### 4. 磁盘空间不足

**检查：**
```bash
df -h
docker system prune  # 清理未使用的资源
```

## 调试步骤

### 1. 查看详细构建日志

```bash
cd deploy
DOCKER_BUILDKIT=1 docker-compose build --progress=plain frontend
```

### 2. 进入容器调试

```bash
# 构建到 deps 层
docker build --target deps -t frontend-deps -f web/Dockerfile ../web

# 进入容器
docker run -it --rm frontend-deps sh

# 手动执行构建命令
cd packages/web
pnpm build
```

### 3. 检查构建产物

```bash
# 查看构建产物目录
ls -la web/docs
```

## 优化建议

1. **使用 BuildKit 缓存**：已启用
2. **增加内存限制**：已设置 4GB
3. **分步构建**：便于定位问题
4. **清理缓存**：如果构建异常，清理 Docker 缓存

```bash
docker builder prune
docker-compose build --no-cache frontend
```


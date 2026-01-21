# 生产环境快速启动指南

## 🚀 快速开始

### 1. 设置环境变量

```bash
# 设置环境为生产环境
export APP_ENV=prod

# 设置 JWT 密钥（必须！）
export JWT_SIGNING_KEY="$(openssl rand -base64 48)"
```

### 2. 创建必要的目录

```bash
# 创建数据目录
sudo mkdir -p /var/lib/jy-admin/{data,uploads}
sudo chown -R $USER:$USER /var/lib/jy-admin

# 创建日志目录
sudo mkdir -p /var/log/jy-admin
sudo chown -R $USER:$USER /var/log/jy-admin
```

### 3. 启动应用

```bash
cd server
APP_ENV=prod JWT_SIGNING_KEY="your-secret-key" ./jy-admin
```

## 📋 配置文件说明

- `config.yaml` - 默认配置（开发环境）
- `config.dev.yaml` - 开发环境配置
- `config.prod.yaml` - **生产环境配置** ⭐

应用会根据 `APP_ENV` 环境变量自动加载对应的配置文件。

## ⚙️ 生产环境配置要点

### ✅ 必须配置

1. **JWT 密钥** - 通过环境变量设置
2. **目录权限** - 确保数据、日志、上传目录有写权限
3. **禁用自动迁移** - 生产环境已自动禁用

### 📝 推荐配置

1. **日志格式** - JSON（便于日志收集）
2. **日志级别** - info（生产环境）
3. **超时时间** - 300秒（降低超时）
4. **严格认证** - 已启用

## 🔍 验证配置

启动应用后，应该看到：

```
读取配置成功: config.prod.yaml (环境: prod)
已从环境变量 JWT_SIGNING_KEY 读取 JWT 密钥
日志系统初始化成功
```

## 📚 详细文档

查看 `PRODUCTION_CONFIG.md` 获取完整的生产环境配置指南。


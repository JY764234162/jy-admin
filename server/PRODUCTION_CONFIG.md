# 生产环境配置指南

## 📋 概述

本文档说明如何配置和使用生产环境配置文件。

## 🚀 快速开始

### 1. 使用生产环境配置

```bash
# 方式一：通过环境变量
export APP_ENV=prod
./jy-admin

# 方式二：单次运行
APP_ENV=prod ./jy-admin

# 方式三：在代码中设置（不推荐）
os.Setenv("APP_ENV", "prod")
```

### 2. 配置文件说明

- `config.yaml` - 默认配置（开发环境）
- `config.dev.yaml` - 开发环境配置
- `config.prod.yaml` - 生产环境配置

应用会根据 `APP_ENV` 环境变量自动加载对应的配置文件。

## ⚙️ 生产环境配置说明

### 1. 系统配置

```yaml
system:
  disable-auto-migrate: true    # ⚠️ 必须禁用自动迁移
  use-strict-auth: true         # ✅ 启用严格认证
  read-timeout: 300             # 降低超时时间
  write-timeout: 300            # 降低超时时间
```

**重要说明：**
- `disable-auto-migrate: true` - 生产环境必须禁用自动数据库迁移，数据库结构变更应该通过手动迁移脚本完成
- `use-strict-auth: true` - 启用更严格的认证检查

### 2. JWT 配置

```yaml
jwt:
  signing-key: JY-Admin-Production-Change-This-Key  # 默认值，建议通过环境变量覆盖
  expires-time: 7d
```

**⚠️ 安全要求：**

生产环境**强烈建议**通过环境变量设置 JWT 密钥（优先级最高）：

```bash
# 生成强密钥（至少 32 字符，推荐 64 字符）
export JWT_SIGNING_KEY="$(openssl rand -base64 48)"

# 或手动设置（至少 32 字符）
export JWT_SIGNING_KEY="your-very-long-random-secret-key-at-least-32-chars"
```

**环境变量优先级：**
1. `JWT_SIGNING_KEY` 环境变量（最高优先级）
2. `JY_JWT_SIGNING_KEY` 环境变量（Viper 自动环境变量）
3. 配置文件中的 `signing-key`（最低优先级）

**安全建议：**
- ✅ 使用环境变量设置 JWT 密钥
- ✅ 密钥长度至少 32 字符，推荐 64 字符
- ❌ 不要在配置文件中硬编码生产环境的 JWT 密钥
- ❌ 不要将包含密钥的配置文件提交到版本控制系统

### 3. 数据库配置

```yaml
sqlite:
  path: /var/lib/jy-admin/data    # 使用绝对路径
  db-name: 'jiangyi_prod'
  max-open-conns: 50              # 根据实际负载调整
  log-mode: warn                  # 减少数据库日志
```

**路径要求：**
- 使用绝对路径，避免相对路径问题
- 确保目录存在且有写权限
- 建议使用 `/var/lib/jy-admin/data` 或类似的标准目录

### 4. 日志配置

```yaml
log:
  level: info                      # 生产环境使用 info
  format: json                     # 使用 JSON 格式
  output: file                     # 只输出到文件
  path: /var/log/jy-admin          # 使用绝对路径
  max-backups: 30                  # 保留更多日志文件
  max-age: 90                      # 保留更长时间
```

**日志路径：**
- 使用绝对路径：`/var/log/jy-admin`
- 确保目录存在且有写权限
- JSON 格式便于日志收集和分析（如 ELK、Loki 等）

### 5. 文件存储配置

```yaml
local:
  path: /var/lib/jy-admin/uploads
  store-path: /var/lib/jy-admin/uploads
```

**路径要求：**
- 使用绝对路径
- 确保目录存在且有写权限
- 建议使用 `/var/lib/jy-admin/uploads` 或类似的标准目录

## 🔒 安全配置清单

### ✅ 必须配置项

- [ ] 修改 JWT 密钥（通过环境变量）
- [ ] 禁用自动数据库迁移
- [ ] 启用严格认证
- [ ] 使用绝对路径（数据库、日志、上传文件）
- [ ] 设置合适的文件权限
- [ ] 配置日志轮转和清理

### ⚠️ 建议配置项

- [ ] 使用 HTTPS（配置反向代理）
- [ ] 配置防火墙规则
- [ ] 设置资源限制（CPU、内存）
- [ ] 配置监控和告警
- [ ] 定期备份数据库和文件

## 📝 部署步骤

### 1. 创建必要的目录

```bash
# 创建数据目录
sudo mkdir -p /var/lib/jy-admin/{data,uploads}
sudo chown -R your-user:your-group /var/lib/jy-admin

# 创建日志目录
sudo mkdir -p /var/log/jy-admin
sudo chown -R your-user:your-group /var/log/jy-admin
```

### 2. 设置环境变量

```bash
# 设置环境变量（临时）
export APP_ENV=prod
export JWT_SIGNING_KEY="your-production-secret-key"

# 或写入 ~/.bashrc 或 ~/.zshrc（永久）
echo 'export APP_ENV=prod' >> ~/.bashrc
echo 'export JWT_SIGNING_KEY="your-production-secret-key"' >> ~/.bashrc
source ~/.bashrc
```

### 3. 使用 systemd 服务（推荐）

创建 `/etc/systemd/system/jy-admin.service`：

```ini
[Unit]
Description=JY Admin Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/jy-admin/server
ExecStart=/path/to/jy-admin/server/jy-admin
Restart=always
RestartSec=5

# 环境变量
Environment="APP_ENV=prod"
Environment="JWT_SIGNING_KEY=your-production-secret-key"

# 资源限制
LimitNOFILE=65535
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable jy-admin
sudo systemctl start jy-admin
sudo systemctl status jy-admin
```

### 4. 使用 Docker

```dockerfile
FROM alpine:latest
WORKDIR /app
COPY jy-admin .
COPY config.prod.yaml .

ENV APP_ENV=prod
ENV JWT_SIGNING_KEY=your-production-secret-key

CMD ["./jy-admin"]
```

运行：

```bash
docker run -d \
  -e APP_ENV=prod \
  -e JWT_SIGNING_KEY="your-production-secret-key" \
  -v /var/lib/jy-admin/data:/var/lib/jy-admin/data \
  -v /var/lib/jy-admin/uploads:/var/lib/jy-admin/uploads \
  -v /var/log/jy-admin:/var/log/jy-admin \
  -p 7777:7777 \
  jy-admin:latest
```

### 5. 使用 Kubernetes

在 Deployment 中设置环境变量：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jy-admin
spec:
  template:
    spec:
      containers:
      - name: jy-admin
        env:
        - name: APP_ENV
          value: "prod"
        - name: JWT_SIGNING_KEY
          valueFrom:
            secretKeyRef:
              name: jy-admin-secret
              key: jwt-signing-key
```

## 🔍 验证配置

### 1. 检查配置加载

启动应用时应该看到：

```
读取配置成功: config.prod.yaml (环境: prod)
```

### 2. 检查环境变量

```bash
# 检查环境变量是否设置
echo $APP_ENV
echo $JWT_SIGNING_KEY
```

### 3. 检查目录权限

```bash
# 检查目录是否存在且有写权限
ls -la /var/lib/jy-admin/
ls -la /var/log/jy-admin/

# 测试写入权限
touch /var/lib/jy-admin/data/test.txt
touch /var/log/jy-admin/test.log
```

### 4. 检查日志输出

```bash
# 查看日志文件
tail -f /var/log/jy-admin/app.log

# 检查日志格式（应该是 JSON）
head -n 1 /var/log/jy-admin/app.log
```

## 📊 配置对比

| 配置项 | 开发环境 | 生产环境 |
|--------|---------|---------|
| `disable-auto-migrate` | `false` | `true` ⚠️ |
| `use-strict-auth` | `false` | `true` |
| `read-timeout` | 600 | 300 |
| `write-timeout` | 600 | 300 |
| `log.level` | `debug` | `info` |
| `log.format` | `console` | `json` |
| `log.output` | `stdout` | `file` |
| `log.path` | `./logs` | `/var/log/jy-admin` |
| `sqlite.path` | `./` | `/var/lib/jy-admin/data` |
| `sqlite.log-mode` | `info` | `warn` |
| `jwt.signing-key` | 简单密钥 | 环境变量 ⚠️ |

## 🐛 常见问题

### 1. 配置文件未找到

**错误：** `Failed to read config file: config.prod.yaml`

**解决：**
- 确保 `config.prod.yaml` 文件存在于应用目录
- 检查文件权限
- 确认 `APP_ENV` 环境变量设置正确

### 2. 目录不存在或权限不足

**错误：** `创建日志目录失败` 或 `连接数据库失败`

**解决：**
```bash
# 创建目录
sudo mkdir -p /var/lib/jy-admin/{data,uploads}
sudo mkdir -p /var/log/jy-admin

# 设置权限
sudo chown -R your-user:your-group /var/lib/jy-admin
sudo chown -R your-user:your-group /var/log/jy-admin
```

### 3. JWT 密钥未设置

**警告：** 使用默认密钥

**解决：**
```bash
export JWT_SIGNING_KEY="your-production-secret-key"
```

### 4. 环境变量未生效

**问题：** 修改环境变量后配置未更新

**解决：**
- 重启应用
- 检查环境变量是否正确设置：`echo $APP_ENV`
- 确认配置文件路径正确

## 📚 相关文档

- `LOGGING.md` - 日志功能使用指南
- `ENVIRONMENT.md` - 环境区分指南
- `config.prod.yaml` - 生产环境配置文件
- `config.dev.yaml` - 开发环境配置文件


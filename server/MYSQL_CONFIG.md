# MySQL 数据库配置指南

## 📋 概述

项目支持 SQLite 和 MySQL 两种数据库。本文档说明如何配置和使用 MySQL 数据库。

## 🚀 快速开始

### 1. 安装 MySQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

#### CentOS/RHEL
```bash
sudo yum install mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

#### macOS
```bash
brew install mysql
brew services start mysql
```

### 2. 创建数据库和用户

```sql
-- 登录 MySQL
mysql -u root -p

-- 创建数据库
CREATE DATABASE jy_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户（推荐）
CREATE USER 'jy_admin'@'localhost' IDENTIFIED BY 'your-password';

-- 授权
GRANT ALL PRIVILEGES ON jy_admin.* TO 'jy_admin'@'localhost';
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

### 3. 配置应用

#### 方式一：修改配置文件

编辑 `config.yaml` 或 `config.prod.yaml`：

```yaml
system:
  db-type: mysql  # 改为 mysql

mysql:
  path: 'localhost'              # MySQL 主机地址
  port: '3306'                   # MySQL 端口
  config: 'charset=utf8mb4&parseTime=True&loc=Local'
  db-name: 'jy_admin'            # 数据库名
  username: 'jy_admin'           # 数据库用户名
  password: 'your-password'       # 数据库密码
  max-idle-conns: 10
  max-open-conns: 100
  log-mode: 'info'
```

#### 方式二：使用环境变量（推荐，更安全）

```bash
# 设置数据库类型
export APP_ENV=prod

# 设置 MySQL 密码（优先级最高）
export MYSQL_PASSWORD="your-password"

# 启动应用
./jy-admin
```

配置文件中的密码会被环境变量覆盖。

### 4. 启动应用

```bash
cd server
APP_ENV=prod MYSQL_PASSWORD="your-password" ./jy-admin
```

## ⚙️ 配置说明

### MySQL 配置项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `path` | MySQL 主机地址 | `localhost`, `127.0.0.1`, `192.168.1.100` |
| `port` | MySQL 端口 | `3306`（默认） |
| `db-name` | 数据库名 | `jy_admin` |
| `username` | 数据库用户名 | `jy_admin`, `root` |
| `password` | 数据库密码 | 建议通过环境变量设置 |
| `config` | 连接参数 | `charset=utf8mb4&parseTime=True&loc=Local` |
| `max-idle-conns` | 最大空闲连接数 | `10` |
| `max-open-conns` | 最大打开连接数 | `100`（根据负载调整） |
| `log-mode` | GORM 日志级别 | `info`, `warn`, `error`, `silent` |

### 连接参数说明

`config` 字段可以包含以下参数：

- `charset=utf8mb4` - 字符集（推荐 utf8mb4，支持 emoji）
- `parseTime=True` - 解析时间字段
- `loc=Local` - 时区设置
- `timeout=10s` - 连接超时
- `readTimeout=30s` - 读取超时
- `writeTimeout=30s` - 写入超时
- `collation=utf8mb4_unicode_ci` - 排序规则

示例：
```yaml
config: 'charset=utf8mb4&parseTime=True&loc=Local&timeout=10s&readTimeout=30s&writeTimeout=30s'
```

## 🔒 安全配置

### 1. 使用专用数据库用户

不要使用 `root` 用户，创建专用用户：

```sql
CREATE USER 'jy_admin'@'localhost' IDENTIFIED BY 'strong-password';
GRANT ALL PRIVILEGES ON jy_admin.* TO 'jy_admin'@'localhost';
```

### 2. 使用环境变量设置密码

**不要**在配置文件中硬编码密码：

```bash
# ✅ 推荐：使用环境变量
export MYSQL_PASSWORD="your-password"

# ❌ 不推荐：在配置文件中硬编码
password: 'your-password'
```

### 3. 限制数据库访问

```sql
-- 只允许本地连接
CREATE USER 'jy_admin'@'localhost' IDENTIFIED BY 'password';

-- 或允许特定 IP
CREATE USER 'jy_admin'@'192.168.1.%' IDENTIFIED BY 'password';
```

### 4. 使用 SSL 连接（可选）

如果 MySQL 服务器启用了 SSL，可以在 `config` 中添加：

```yaml
config: 'charset=utf8mb4&parseTime=True&loc=Local&tls=true'
```

## 📊 性能优化

### 1. 连接池配置

根据实际负载调整连接池大小：

```yaml
mysql:
  max-idle-conns: 10    # 空闲连接数（建议 5-10）
  max-open-conns: 100   # 最大连接数（根据并发调整）
```

**建议值：**
- 小规模应用：`max-open-conns: 50`
- 中等规模应用：`max-open-conns: 100`
- 大规模应用：`max-open-conns: 200+`

### 2. MySQL 服务器配置

编辑 `/etc/mysql/mysql.conf.d/mysqld.cnf`：

```ini
[mysqld]
max_connections = 200
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
```

### 3. 索引优化

确保数据库表有适当的索引。应用会自动创建必要的索引。

## 🔍 故障排查

### 1. 连接失败

**错误：** `连接数据库失败: dial tcp: connect: connection refused`

**解决：**
- 检查 MySQL 服务是否运行：`sudo systemctl status mysql`
- 检查端口是否正确：`netstat -tlnp | grep 3306`
- 检查防火墙设置

### 2. 认证失败

**错误：** `连接数据库失败: Access denied for user`

**解决：**
- 检查用户名和密码是否正确
- 检查用户是否有权限访问数据库
- 检查用户是否允许从该主机连接

### 3. 数据库不存在

**错误：** `连接数据库失败: Unknown database`

**解决：**
```sql
CREATE DATABASE jy_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 字符集问题

**错误：** 中文乱码

**解决：**
- 确保数据库使用 `utf8mb4` 字符集
- 确保连接参数包含 `charset=utf8mb4`

### 5. 时区问题

**错误：** 时间不正确

**解决：**
- 在 `config` 中添加 `loc=Local` 或 `loc=Asia/Shanghai`
- 确保 MySQL 服务器时区设置正确

## 📝 配置示例

### 开发环境

```yaml
system:
  db-type: mysql

mysql:
  path: 'localhost'
  port: '3306'
  config: 'charset=utf8mb4&parseTime=True&loc=Local'
  db-name: 'jy_admin_dev'
  username: 'root'
  password: 'password'
  max-idle-conns: 5
  max-open-conns: 20
  log-mode: info
```

### 生产环境

```yaml
system:
  db-type: mysql

mysql:
  path: 'localhost'
  port: '3306'
  config: 'charset=utf8mb4&parseTime=True&loc=Local&timeout=10s&readTimeout=30s&writeTimeout=30s'
  db-name: 'jy_admin_prod'
  username: 'jy_admin'
  password: ${MYSQL_PASSWORD:change-this-password}  # 通过环境变量设置
  max-idle-conns: 10
  max-open-conns: 100
  log-mode: warn
```

启动时设置环境变量：

```bash
export MYSQL_PASSWORD="your-production-password"
APP_ENV=prod ./jy-admin
```

## 🔄 从 SQLite 迁移到 MySQL

### 1. 导出 SQLite 数据（可选）

如果需要迁移现有数据：

```bash
# 使用 sqlite3 导出数据
sqlite3 jiangyi.db .dump > backup.sql
```

### 2. 创建 MySQL 数据库

```sql
CREATE DATABASE jy_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. 修改配置

将 `system.db-type` 改为 `mysql`，并配置 MySQL 连接信息。

### 4. 启动应用

应用会自动创建表结构（如果 `disable-auto-migrate: false`）。

### 5. 导入数据（如果有）

如果需要导入 SQLite 导出的数据，需要手动转换 SQL 语法。

## 📚 相关文档

- `PRODUCTION_CONFIG.md` - 生产环境配置指南
- `config.prod.yaml` - 生产环境配置文件
- `config.dev.yaml` - 开发环境配置文件

## 💡 最佳实践

1. ✅ **使用专用数据库用户**，不要使用 root
2. ✅ **通过环境变量设置密码**，不要硬编码
3. ✅ **使用 utf8mb4 字符集**，支持 emoji 和特殊字符
4. ✅ **合理配置连接池**，根据实际负载调整
5. ✅ **定期备份数据库**，使用 mysqldump 或备份工具
6. ✅ **监控数据库性能**，使用 MySQL 监控工具
7. ✅ **启用慢查询日志**，优化慢查询


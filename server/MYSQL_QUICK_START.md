# MySQL 快速开始

## 🚀 三步快速配置 MySQL

### 1. 创建数据库

```sql
CREATE DATABASE jy_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'jy_admin'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON jy_admin.* TO 'jy_admin'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 修改配置

编辑 `config.yaml`：

```yaml
system:
  db-type: mysql  # 改为 mysql

mysql:
  path: 'localhost'
  port: '3306'
  db-name: 'jy_admin'
  username: 'jy_admin'
  password: 'your-password'  # 或通过环境变量 MYSQL_PASSWORD 设置
```

### 3. 启动应用

```bash
# 方式一：使用配置文件中的密码
./jy-admin

# 方式二：使用环境变量（推荐）
MYSQL_PASSWORD="your-password" ./jy-admin
```

## ✅ 验证

启动后应该看到：

```
使用 MySQL 数据库: jy_admin@localhost:3306/jy_admin
连接数据库成功: jy_admin:***@tcp(localhost:3306)/jy_admin?charset=utf8mb4&parseTime=True&loc=Local
```

## 📚 详细文档

查看 `MYSQL_CONFIG.md` 获取完整的配置指南。


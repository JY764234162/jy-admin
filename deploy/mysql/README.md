# MySQL 部署配置

本目录包含 MySQL 服务的部署相关文件。

## 文件说明

- `init.sql` - MySQL 初始化 SQL 脚本（可选）

## 使用说明

### 初始化脚本

`init.sql` 会在 MySQL 容器首次启动时自动执行（如果挂载到 `/docker-entrypoint-initdb.d/`）。

### 数据持久化

MySQL 数据通过 Docker volume `mysql_data` 持久化，删除容器不会丢失数据。

### 配置

MySQL 的配置文件位于 `../server/mysql/conf.d/`，包含字符集、时区等配置。

### 注意事项

1. **初始化脚本**：只在数据库首次创建时执行
2. **数据备份**：定期备份 `mysql_data` volume
3. **端口**：MySQL 不暴露端口，只在 Docker 网络内访问


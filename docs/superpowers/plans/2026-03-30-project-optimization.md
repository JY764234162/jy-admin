# 项目综合优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 jy-admin 项目进行全栈综合优化，涵盖前端性能、后端性能、项目架构三个维度

**Architecture:** 本项目是 Go + React 全栈管理后台，包含 Gin 后端 API 和 React + Vite 前端。通过本次优化，提升构建性能、运行时性能、可维护性和部署效率。

**Tech Stack:** Go (Gin/GORM), React 18, TypeScript, Vite, Ant Design 5, MySQL, Docker

---

## 第一部分：前端性能优化

### 优化 1.1: 清理冗余状态管理库

**问题:** 项目同时引入 Redux Toolkit、Jotai、Recoil、Zustand 四个状态管理库，其中三个（Jotai/Recoil/Zustand）仅用于 `/pages/library/state` 演示页面，造成约 50KB+ 的 bundle 体积浪费。

**文件:**
- 修改: `web/packages/web/package.json` - 移除 jotai, recoil, zustand 依赖
- 修改: `web/packages/web/src/pages/library/state/index.tsx` - 移除三个库的演示代码
- 验证: `web/packages/web/src/store/` - 确认 Redux 使用正常

- [ ] **Step 1: 备份并修改 package.json，移除三个状态管理库**

```json
// 从 dependencies 中移除:
"jotai": "^2.12.1",
"recoil": "^0.7.4",
"zustand": "^5.0.1",
```

- [ ] **Step 2: 更新 pnpm-lock.yaml**

Run: `cd web && pnpm install`
Expected: 三个库被移除，无报错

- [ ] **Step 3: 简化 state 演示页面，移除对 Jotai/Recoil/Zustand 的依赖**

```tsx
// 修改 web/packages/web/src/pages/library/state/index.tsx
// 保留 Redux 使用示例，移除其他三个库的示例代码
import { useSelector } from 'react-redux'
// 移除: import { useAtom } from 'jotai'
// 移除: import { useRecoilState } from 'recoil'
// 移除: import { useZustandStore }
```

- [ ] **Step 4: 验证构建正常**

Run: `cd web/packages/web && pnpm build`
Expected: 构建成功，bundle size 减小约 50KB

---

### 优化 1.2: 启用 Bundle 分析工具

**问题:** `rollup-plugin-visualizer` 已安装但被注释掉，无法进行 bundle 体积分析。

**文件:**
- 修改: `web/packages/web/vite.config.ts` - 启用 visualizer 插件

- [ ] **Step 1: 取消 visualizer 插件注释**

```typescript
// vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

// 在 plugins 数组中添加:
visualizer({
  open: false,  // 不自动打开浏览器
  gzipSize: true,
  filename: "bundle-report.html",  // 输出到项目根目录
}),
```

- [ ] **Step 2: 运行构建并生成报告**

Run: `cd web/packages/web && pnpm build && pnpm preview`
Expected: 构建成功，生成 bundle-report.html

- [ ] **Step 3: 提交更改**

```bash
git add web/packages/web/vite.config.ts
git commit -m "perf: enable bundle visualizer for analysis"
```

---

### 优化 1.3: 配置 Rollup Manual Chunks 分离重库

**问题:** 大型库（three.js、pdfjs-dist）未分离，导致首屏加载过慢。

**文件:**
- 修改: `web/packages/web/vite.config.ts` - 添加 manualChunks 配置

- [ ] **Step 1: 添加 manualChunks 配置**

```typescript
// vite.config.ts build.rollupOptions.output
build: {
  // ... existing config
  rollupOptions: {
    output: {
      manualChunks: {
        "vendor-react": ["react", "react-dom", "react-router-dom"],
        "vendor-antd": ["antd", "@ant-design/icons"],
        "vendor-three": ["three", "@react-three/fiber", "@react-three/drei"],
        "vendor-pdf": ["pdfjs-dist"],
      },
    },
  },
},
```

- [ ] **Step 2: 验证 chunk 分离**

Run: `cd web/packages/web && pnpm build`
Expected: 生成独立的 vendor-*.js 文件

- [ ] **Step 3: 提交**

```bash
git add web/packages/web/vite.config.ts
git commit -m "perf: separate heavy vendor libs into chunks"
```

---

### 优化 1.4: 修复 TypeScript 配置

**文件:**
- 修改: `web/packages/web/tsconfig.json`

- [ ] **Step 1: 调整 esModuleInterop**

```json
{
  "compilerOptions": {
    "esModuleInterop": true,  // 改为 true
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true  // 添加，防止数组越界访问
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd web/packages/web && npx tsc --noEmit`
Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add web/packages/web/tsconfig.json
git commit -m "chore: improve TypeScript strictness settings"
```

---

## 第二部分：后端性能优化

### 优化 2.1: GORM 配置增强

**问题:** 未启用 PrepareStmt，导致每次查询都需要重新解析 SQL。

**文件:**
- 修改: `server/core/gorm.go:55-65`

- [ ] **Step 1: 添加 PrepareStmt 配置**

```go
// server/core/gorm.go 第 55-61 行
gormConfig := &gorm.Config{
    NamingStrategy: schema.NamingStrategy{
        TablePrefix:   prefix,
        SingularTable: singular,
    },
    DisableForeignKeyConstraintWhenMigrating: true,
    PrepareStmt: true,  // 添加：缓存预编译语句
}
```

- [ ] **Step 2: 添加连接生命周期配置**

```go
// 在获取 sqlDB 后（约第 84-86 行）添加:
sqlDB.SetConnMaxLifetime(time.Hour)
sqlDB.SetConnMaxIdleTime(10 * time.Minute)
```

- [ ] **Step 3: 验证后端启动正常**

Run: `cd server && go build -o jy-admin . && ./jy-admin`
Expected: 服务启动成功，数据库连接正常

- [ ] **Step 4: 提交**

```bash
git add server/core/gorm.go
git commit -m "perf: enable GORM PrepareStmt and connection lifecycle"
```

---

### 优化 2.2: 添加数据库索引

**问题:** 多个高频查询字段缺少索引，导致全表扫描。

**文件:**
- 修改: `server/model/system/sys_user.go` - authority_id 索引
- 修改: `server/model/system/sys_base_menu.go` - parent_id, enable 索引
- 修改: `server/model/ai/ai_conversation.go` - updated_at 索引

- [ ] **Step 1: 为 SysUser 添加 authority_id 索引**

```go
// server/model/system/sys_user.go
// 找到 AuthorityId 字段，添加 index tag
AuthorityId string `json:"authorityId" gorm:"index;comment:用户角色ID"`
```

- [ ] **Step 2: 为 SysBaseMenu 添加 parent_id 和 enable 索引**

```go
// server/model/system/sys_base_menu.go
ParentId string `json:"parentId" gorm:"index;comment:父菜单ID"`
Enable   bool   `json:"enable" gorm:"index;default:1;comment:菜单状态"`
```

- [ ] **Step 3: 为 AIConversation 添加 updated_at 索引**

```go
// server/model/ai/ai_conversation.go
UpdatedAt time.Time `json:"updatedAt" gorm:"index;comment:更新时间"`
```

- [ ] **Step 4: 验证索引生效**

Run: `cd server && go build -o jy-admin . && ./jy-admin`
Expected: AutoMigrate 自动添加新索引

- [ ] **Step 5: 提交**

```bash
git add server/model/system/sys_user.go server/model/system/sys_base_menu.go server/model/ai/ai_conversation.go
git commit -m "perf: add missing database indexes for query optimization"
```

---

### 优化 2.3: 优化 API Handler 的 Select 字段

**问题:** list API 未指定 Select 字段，导致加载不必要的列数据。

**文件:**
- 修改: `server/api/user/list.go:36-42`
- 修改: `server/api/menu/list.go:27-28`

- [ ] **Step 1: 修改 user list API 添加 Select**

```go
// server/api/user/list.go 第 36-42 行
var users []system.SysUser
var total int64

db := global.JY_DB.Model(&system.SysUser{})
err := db.Count(&total).Error
// 添加 Select 限制字段
err = db.Select("id, username, nickname, authority_id, email, phone, avatar, status, created_at").
    Limit(search.PageSize).Offset((search.Page - 1) * search.PageSize).
    Order("id DESC").Find(&users).Error
```

- [ ] **Step 2: 修改 menu list API 添加 Select**

```go
// server/api/menu/list.go 第 27-28 行
var menus []system.SysBaseMenu
err := global.JY_DB.Select("id, parent_id, path, name, sort, enable, icon, keep_alive").
    Order("sort ASC").Find(&menus).Error
```

- [ ] **Step 3: 验证 API 功能正常**

Run: `curl http://localhost:7777/api/user/list` with valid JWT
Expected: 返回用户列表，功能正常

- [ ] **Step 4: 提交**

```bash
git add server/api/user/list.go server/api/menu/list.go
git commit -m "perf: add Select() to list APIs to reduce data transfer"
```

---

### 优化 2.4: 连接池配置增强

**文件:**
- 修改: `server/config/dev.yaml` - 添加连接池高级配置
- 修改: `server/model/system/sys_user.go` - 自动同步配置到模型

- [ ] **Step 1: 更新 config.dev.yaml**

```yaml
# database 配置中添加:
max-idle-conns: 10
max-open-conns: 100
conn-max-lifetime: 3600    # 1小时
conn-max-idle-time: 600     # 10分钟
```

- [ ] **Step 2: 在 gorm.go 中应用新配置**

```go
// server/core/gorm.go 在设置 maxIdleConns 后添加:
sqlDB.SetConnMaxLifetime(time.Duration(global.JY_Config.Database.ConnMaxLifetime) * time.Second)
if global.JY_Config.Database.ConnMaxIdleTime > 0 {
    sqlDB.SetConnMaxIdleTime(time.Duration(global.JY_Config.Database.ConnMaxIdleTime) * time.Second)
}
```

- [ ] **Step 3: 验证启动正常**

Run: `cd server && go build && ./jy-admin`
Expected: 启动成功，无连接池配置错误

- [ ] **Step 4: 提交**

```bash
git add server/config/dev.yaml server/core/gorm.go
git commit -m "perf: add connection pool lifecycle configuration"
```

---

## 第三部分：项目架构/DevOps 优化

### 优化 3.1: 修复 msfz 服务配置

**问题:** msfz 服务缺少健康检查、端口映射、资源限制、重启策略。

**文件:**
- 修改: `docker-compose.yml` - msfz 服务配置补全

- [ ] **Step 1: 添加 msfz 服务配置**

```yaml
# docker-compose.yml 中的 msfz 服务
msfz:
  image: ${DOCKER_REGISTRY:-registry.cn-beijing.aliyuncs.com}/msfz:${VERSION:-latest}
  container_name: jy-msfz
  restart: always
  ports:
    - "8080:80"  # 添加端口映射
  healthcheck:
    test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/"]
    interval: 30s
    timeout: 3s
    retries: 3
    start_period: 10s
  mem_limit: 256m
  cpus: 0.5
  networks:
    - jy-network
```

- [ ] **Step 2: 验证 docker-compose 语法**

Run: `docker-compose config`
Expected: 语法正确，无报错

- [ ] **Step 3: 提交**

```bash
git add docker-compose.yml
git commit -m "fix: add missing healthcheck, port, resource limits to msfz service"
```

---

### 优化 3.2: 优化 Go Dockerfile 层缓存

**问题:** go.mod 复制在源码复制之后，导致代码变更时依赖缓存失效。

**文件:**
- 修改: `server/Dockerfile`

- [ ] **Step 1: 调整 Dockerfile 层顺序**

```dockerfile
# server/Dockerfile
# 将 go.mod 和 go.sum 复制提前到源码之前
COPY go.mod go.sum ./
RUN go mod download

# 然后再复制源码
COPY . .
```

- [ ] **Step 2: 验证构建正常**

Run: `docker build -t jy-admin-test -f server/Dockerfile server/`
Expected: 构建成功，依赖层被缓存

- [ ] **Step 3: 提交**

```bash
git add server/Dockerfile
git commit -m "perf: optimize Dockerfile layer caching for Go modules"
```

---

### 优化 3.3: CI/CD 安全修复

**问题:** CI/CD 中的 `printenv` 可能泄露敏感环境变量到日志。

**文件:**
- 修改: `.github/workflows/deploy.yml`

- [ ] **Step 1: 移除或过滤 printenv 输出**

```yaml
# .github/workflows/deploy.yml
# 删除或注释掉 printenv 步骤
# 或者只打印非敏感变量:
- name: Debug Info
  run: |
    echo "Deploying to ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }}"
    echo "Server IP: ${{ steps.init.outputs.server_ip }}"
```

- [ ] **Step 2: 提交**

```bash
git add .github/workflows/deploy.yml
git commit -m "security: remove sensitive env variable printing in CI"
```

---

### 优化 3.4: 服务器配置可参数化

**问题:** ShutdownTimeout、MaxHeaderBytes 等硬编码。

**文件:**
- 修改: `server/core/server.go` - 将硬编码值移到配置

- [ ] **Step 1: 更新 config 系统配置**

```yaml
# server/config/dev.yaml
system:
  # 现有配置...
  shutdown-timeout: 10  # 新增：优雅关闭超时（秒）
  max-header-bytes: 1048576  # 新增：1MB = 1<<20
  idle-timeout: 90  # 新增：keep-alive 空闲超时（秒）
```

- [ ] **Step 2: 修改 server.go 使用配置值**

```go
// server/core/server.go
// 在 CreateServer 函数中
ReadTimeout:    readTimeout,
WriteTimeout:   writeTimeout,
IdleTimeout:    time.Duration(global.JY_Config.System.IdleTimeout) * time.Second,  // 新增
MaxHeaderBytes: global.JY_Config.System.MaxHeaderBytes,  // 新增
// ShutdownTimeout 从配置读取
srv := &http.Server{
    Addr:           addr,
    Handler:        engine,
    ReadTimeout:    readTimeout,
    WriteTimeout:   writeTimeout,
    IdleTimeout:    time.Duration(global.JY_Config.System.IdleTimeout) * time.Second,
    MaxHeaderBytes: global.JY_Config.System.MaxHeaderBytes,
}
```

- [ ] **Step 3: 验证启动正常**

Run: `cd server && go build && ./jy-admin`
Expected: 启动成功，新配置生效

- [ ] **Step 4: 提交**

```bash
git add server/core/server.go server/config/dev.yaml
git commit -m "perf: make server timeouts configurable"
```

---

## 实施检查清单

完成所有任务后，运行以下验证：

### 前端验证
```bash
cd web/packages/web
pnpm build  # 构建成功
pnpm lint   # 无 lint 错误
```

### 后端验证
```bash
cd server
go build -o jy-admin .
./jy-admin  # 启动成功
curl http://localhost:7777/api/user/list  # API 正常
```

### Docker 验证
```bash
docker-compose config  # 语法正确
docker-compose up -d   # 所有服务启动
docker-compose ps      # 所有服务健康
```

---

## 优化效果预估

| 优化项 | 预期效果 |
|--------|----------|
| 移除 Jotai/Recoil/Zustand | Bundle 减小 ~50KB |
| Manual Chunks 分离 | 首屏加载更快 |
| GORM PrepareStmt | 查询性能提升 10-20% |
| 数据库索引 | 列表查询提升 5-10x |
| Select 字段限制 | 数据传输量减少 30-50% |
| Docker 层缓存 | 构建时间缩短 30%+ |
| msfz 服务配置 | 服务可靠性提升 |

---

## 风险与回滚

- **前端**: 所有更改通过 git 管理，可快速回滚
- **后端**: 数据库索引添加是安全的（添加新索引不会删除数据）
- **Docker**: 修改前备份 docker-compose.yml

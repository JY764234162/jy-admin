# CLAUDE.md

本文件为 Claude Code（claude.ai/code）操作本仓库提供的指南。

## 语言约定（必读）

与本仓库相关的所有输出**统一使用中文**：

- Git 提交信息（commit message）使用中文。
- 代码注释、JSDoc/Go docstring 使用中文。
- 计划文档、架构说明、TODO 列表使用中文。
- 向用户汇报时默认使用中文。

## 项目概览

JY-Admin 是一套基于 Go + React 的全栈后台管理系统，包含三大服务：

- **Go 后端**（`server/`）：Gin + GORM，支持 JWT/RBAC 认证、Swagger 文档、文件上传（本地或腾讯云 COS）、WebSocket 游戏与协同编辑。
- **React 前端**（`web/packages/web/`）：Vite + React 18 + TypeScript + Ant Design + Redux Toolkit。`web/` 是 pnpm workspace，同时包含第二个应用 `packages/msfz/` 和共享工具包 `packages/utils/`。
- **AI 服务**（`ai-server/`）：FastAPI + LangGraph/LangChain，提供基于 RAG 的知识库问答、会话持久化、流式 SSE 响应。向量数据库使用 PostgreSQL + pgvector（本地开发可用 SQLite 回退），文件存储使用腾讯云 COS。

仓库根目录的 `docker-compose.yml` 用于一键启动 MySQL、PostgreSQL/pgvector、后端、前端（Nginx）和 AI 服务。

## 常用命令

### Go 后端（`server/`）

```bash
cd server
go mod download
go run main.go
```

- 本地接口地址：`http://localhost:7777`
- Swagger 文档：`http://localhost:7777/swagger/index.html`
- 本地配置：`server/config.dev.yaml`
- Docker 部署配置（必需）：`server/config.docker.yaml`

本仓库当前未配置 Go 测试套件。

### 前端（`web/`）

使用 pnpm。workspace 根目录的 scripts 默认操作主应用 `packages/web`。

```bash
cd web
pnpm install
pnpm dev                 # 启动 web/packages/web，默认 http://localhost:3000
pnpm dev:msfz           # 启动 packages/msfz 开发服务
pnpm build              # 构建 packages/web 到 packages/web/dist
pnpm preview            # 预览 packages/web 生产构建
pnpm -F web run lint    # ESLint
cd web && pnpm -F web exec tsc --noEmit   # 显式类型检查
pnpm -F web run format  # Prettier 写入
```

开发服务器代理规则：

- `/api` → `http://localhost:7777`
- `/api-fund` → 东方财富基金接口（解决浏览器 CORS）

### AI 服务（`ai-server/`）

使用 `uv` 管理依赖（lock 文件 `uv.lock`），运行前需要加载根目录 `.env` 中的环境变量。

```bash
cd ai-server
uv run python main.py
# 或激活虚拟环境后
python main.py
```

- 本地接口地址：`http://localhost:8000`
- 健康检查：`GET /api/health`
- 路由前缀：`/api/ai/chat`、`/api/ai/conversation`、`/api/ai/knowledge`、`/api/ai/upload`

本仓库当前未配置 Python 测试套件。

### Docker / 部署

```bash
# 本地构建并启动所有服务（会先构建前端）
./deploy-local.sh

# 服务器端部署（要求已构建前端 dist/ 并提供 .env）
./deploy.sh
```

`deploy.sh` 会校验 `server/config.docker.yaml`、根目录 `.env` 以及 `web/packages/web/dist/index.html` 是否存在，然后执行 `docker compose up -d --build`。`deploy-local.sh` 是其本地版本，会先构建前端。

GitHub Actions 工作流 `.github/workflows/deploy.yml` 在 `main` 分支推送时通过 SSH 连接服务器并执行 `./deploy.sh`。

## 高层架构

### Go 后端

入口：`server/main.go` 依次初始化 viper、zap、黑名单缓存、OSS、GORM，注册数据表，从数据库加载黑名单，启动 JWT 清理定时任务，最后调用 `core.InitServer()`。

关键目录：

- `server/api/` —— 按领域分组的 HTTP 处理器（login、user、menu、authority、upload、customer 等）。
- `server/router/enter.go` ——  centralized route registration。公开路由跳过 `JWTAuth()`，私有路由使用 `JWTAuth()`。同时注册 Swagger、静态文件服务、WebSocket 端点，以及 release 模式下的 SPA fallback。
- `server/core/` —— viper、zap、GORM、OSS、服务器生命周期、cron 任务的初始化代码。
- `server/model/system/` 与 `server/model/business/` —— GORM 模型。
- `server/middleware/` —— JWT 认证、RBAC、日志、错误日志。
- `server/websocket/` —— 协同编辑、五子棋、麻将的 WebSocket Hub。

认证：JWT Token + 内存黑名单（启动时从数据库加载）。大部分 `/api/*` 路由需要在请求头携带 `Authorization: Bearer <token>`。

### 前端（`web/packages/web/`）

入口：`src/main.tsx` 依次执行插件初始化（loading、NProgress、Sentry、dayjs），通过 `setupRouter()` 初始化路由，再渲染 Redux `<Provider>` 和 `<App>`。

路由：

- `src/router/createAppRouter.ts` —— 基于后端返回的权限路由和常量路由 `src/router/constantRoutes.ts` 构建完整路由表。
- `src/router/routers.tsx` —— 封装 `createBrowserRouter`/`createHashRouter`/`createMemoryRouter`，并通过 `getBlocker`/`subscribe` 实现全局导航守卫。
- `src/store/slice/route/` —— 权限路由转换与存储。

状态：

- 全局状态使用 `src/store/index.ts` 中的 Redux Toolkit，切片包括 `layout`、`route`、`setting`、`user`。
- 组件局部状态使用 React hooks。

关键目录：

- `src/api/` —— API 客户端封装（axios 包装）。
- `src/pages/` —— 页面模块（如 `user`、`menu`、`authority`、`ai`、`knowledge`、`file`、`editor`、`visualization`）。
- `src/components/` —— 共享组件。
- `src/Layout/` —— 全局外壳（header、sider、menu、breadcrumb、footer）。
- `custom-vite-plugins/` —— web 构建专用 Vite 插件。

Vite 配置（`vite.config.ts`）定义了 `@/` 别名指向 `./src`，并针对 React、Ant Design、Three、PDF 等库做了手动分包，以及本地开发代理表。

### AI 服务（`ai-server/`）

入口：`main.py` 创建 FastAPI 应用，注册中间件、路由，并设置启动/关闭钩子用于初始化数据库表、LangGraph checkpoint 表、长期记忆 store。

关键模块：

- `routers/chat.py` —— 流式对话接口，基于 `services.streaming` 的缓冲区和后台任务。
- `routers/conversation.py` —— 会话 CRUD 与消息列表，消息从 LangGraph checkpoint 中读取。
- `routers/knowledge.py` —— 文档上传、解析进度 SSE、Embedding、向量检索。
- `routers/upload.py` —— 聊天附件上传 COS（不向量化）。
- `services/agent_graph/core.py` —— 为每组 `(user_id, knowledge, search, system_prompt)` 构建 `langgraph.StateGraph`，节点流程：analyze → ensure_placeholder → chat/agent → tools → summarize。Graph 被缓存，并使用异步 Postgres checkpoint saver 编译。
- `services/agent_graph/nodes.py` —— 意图识别、查询改写、闲聊、Agent 推理、摘要生成节点。
- `services/agent_graph/tools_node.py` —— 知识库检索与联网搜索的工具工厂。
- `services/rag/` —— 文档解析、分块、Embedding。
- `services/storage/` —— 向量存储、LangGraph checkpoint 存储、长期记忆存储。
- `services/streaming/` —— 流缓冲、Graph 执行器、断线恢复逻辑。
- `services/middleware.py` —— 与 Go 后端共用同一个 `JWT_SIGNING_KEY` 的 JWT 校验。

Agent 状态管理：短期记忆由 LangGraph checkpoint 自动维护；当消息数超过 `MAX_RAW_MESSAGES` 时，自动触发 `summary` 字段的会话摘要。

### 数据存储

- MySQL —— Go 后端主数据库。
- PostgreSQL + pgvector —— AI 服务向量数据库（`ai_vectors`）。
- SQLite 回退 —— AI 服务可通过 `USE_SQLITE=true` 在无 PostgreSQL 时本地运行。
- 腾讯云 COS —— 后端与 AI 服务的文件上传存储（后端同时支持本地存储）。

## 配置与密钥

- 根目录 `.env` —— Docker Compose 与 AI 服务的环境变量，包含敏感信息（COS 密钥、AI API Key、JWT 密钥、数据库密码等），已加入 `.gitignore`。
- `server/config.dev.yaml` —— Go 后端本地配置，支持 `${JWT_SIGNING_KEY}` 风格的环境变量插值。
- `server/config.docker.yaml` —— Go 后端 Docker 部署配置。
- `web/packages/web/.env.development` 与 `.env.production` —— 前端环境变量（如 `VITE_BASENAME`）。

禁止提交密钥文件或根目录 `.env`。

## 项目约定

仓库已包含 `.cursor/rules/` 规则，重点遵循以下约定：

- 只做最小可行改动，避免无关重构。
- 不引入无关依赖；确需新增时说明用途。
- 前端优先使用 `@/` 路径别名（已在 `tsconfig.json` 和 `vite.config.ts` 配置）。
- 组件使用函数组件 + hooks；局部状态放 React state，跨页面/全局状态接入现有 Redux store，同一模块不混用多套状态方案。
- 页面位于 `web/packages/web/src/pages/<module>/<page>/`，入口为 `index.tsx`；页面入口文件建议不超过 300 行，超过时拆分为 `components/`、`hooks/`、`types.ts`。
- 新页面组件使用 PascalCase，建议以 `Page` 结尾（如 `UserListPage`）。
- 修改前端代码后，确保 `pnpm -F web run type-check` 与 `pnpm -F web run lint` 通过；只修复改动范围内的 lint/类型问题。
- 避免 `any`、`as any`、`@ts-ignore`；确需使用时在同文件内加简短注释说明原因。
- 同一页面不混用两套 UI 组件体系。
- 副作用只放在事件处理或 effect 中，禁止在 render 过程中直接触发。
- 异步操作（表单提交、按钮点击）必须具备 loading/disabled 防重复触发控制。
- pnpm workspace 内部包依赖使用 `workspace:*`，并更新正确的 `package.json`。

## 文档与注释

- 代码注释、提交信息、计划文档统一使用中文。
- 新增文件时在头部补充简要中文说明。
- 复杂逻辑、临时方案、TODO 必须附加中文注释，说明背景与后续处理方向。

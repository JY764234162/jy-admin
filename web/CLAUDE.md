# web/CLAUDE.md

本文件为 Claude Code 操作 `web/`（前端）模块提供的专项指南。根目录 `../CLAUDE.md` 中的全局约定（中文输出、最小改动、禁止提交密钥等）仍然适用。

## 模块定位

`web/` 是 JY-Admin 的前端 monorepo，使用 **pnpm workspace** 管理。主应用为 `packages/web/`（Vite + React 18 + TypeScript + Ant Design + Redux Toolkit），同时包含第二个应用 `packages/msfz/` 和共享工具包 `packages/utils/`。

## 技术栈

- **包管理器**：pnpm 8+
- **构建工具**：Vite 5
- **框架**：React 18 + TypeScript
- **UI 组件库**：Ant Design 5 + Ant Design X
- **状态管理**：Redux Toolkit
- **路由**：React Router v6
- **HTTP 客户端**：axios（封装在 `src/api/`）
- **样式**：Less / CSS Modules / 部分 Tailwind
- **代码规范**：ESLint + Prettier + TypeScript

## Workspace 结构

```text
web/
├── package.json                    # workspace 根配置
├── pnpm-workspace.yaml             # workspace 声明
├── packages/
│   ├── web/                        # 主应用：JY-Admin 后台管理系统
│   │   ├── src/
│   │   │   ├── main.tsx            # 应用入口
│   │   │   ├── App.tsx             # 根组件
│   │   │   ├── Layout/             # 全局布局：Header、Sider、Menu、Breadcrumb、Footer
│   │   │   ├── api/                # axios 封装 + 各模块 API
│   │   │   ├── assets/             # 静态资源
│   │   │   ├── components/         # 共享业务组件
│   │   │   ├── context/            # React Context（少量）
│   │   │   ├── hooks/              # 共享 hooks
│   │   │   ├── pages/              # 页面模块
│   │   │   │   ├── ai/
│   │   │   │   ├── user/
│   │   │   │   ├── menu/
│   │   │   │   ├── authority/
│   │   │   │   ├── knowledge/
│   │   │   │   ├── file/
│   │   │   │   ├── editor/
│   │   │   │   └── visualization/
│   │   │   ├── plugins/            # 插件初始化：loading、NProgress、Sentry、dayjs
│   │   │   ├── router/             # 路由配置与导航守卫
│   │   │   ├── store/              # Redux Toolkit slices
│   │   │   ├── styles/             # 全局样式
│   │   │   ├── types/              # 全局类型
│   │   │   ├── utils/              # 工具函数
│   │   │   └── workers/            # Web Worker
│   │   ├── custom-vite-plugins/    # 自定义 Vite 插件
│   │   ├── vite.config.ts          # Vite 配置
│   │   ├── tsconfig.json           # TypeScript 配置
│   │   ├── .eslintrc.* / eslint.config.*
│   │   └── .prettierrc
│   ├── msfz/                       # 第二个应用（独立入口）
│   └── utils/                      # 共享工具包，workspace 协议依赖
└── .changeset/                     # changesets 版本管理
```

## 常用命令

```bash
cd web

# 安装依赖
pnpm install

# 启动主应用，默认 http://localhost:3000
pnpm dev

# 启动 msfz 应用
pnpm dev:msfz

# 构建主应用到 packages/web/dist
pnpm build

# 预览生产构建
pnpm preview

# ESLint
pnpm -F web run lint

# 显式类型检查
pnpm -F web exec tsc --noEmit

# Prettier 写入
pnpm -F web run format
```

> 根目录的 `package.json` scripts 默认操作 `packages/web`，使用 `-F web`、`-F msfz`、`-F utils` 可分别操作各包。

## 开发约定

### 1. 页面组织

- 页面位于 `packages/web/src/pages/<module>/<page>/`，入口文件为 `index.tsx`。
- 新页面组件使用 PascalCase，建议以 `Page` 结尾，例如 `UserListPage`。
- 页面入口文件建议不超过 300 行；超过时拆分为：
  - `components/` —— 页面级子组件
  - `hooks/` —— 页面专用 hooks
  - `types.ts` —— 页面类型
  - `utils.ts` —— 页面工具函数

### 2. 路径别名

- `@/` 指向 `packages/web/src/`，已在 `tsconfig.json` 和 `vite.config.ts` 中配置。
- 优先使用 `@/components/xxx` 而非相对路径 `../../../components/xxx`。
- workspace 内部包依赖使用 `workspace:*`，如 `@jy/utils`。

### 3. 组件规范

- 使用函数组件 + hooks。
- 局部状态放 React state；跨页面/全局状态接入现有 Redux store。
- 同一页面不混用两套 UI 组件体系（如同时用 Ant Design 和 Material UI）。
- 组件 props 优先显式定义 TypeScript interface，避免 `any`。
- 副作用只放在事件处理或 `useEffect` 中，禁止在 render 过程中直接触发。
- 异步操作（表单提交、按钮点击）必须具备 `loading` / `disabled` 防重复触发控制。

### 4. 状态管理

- 全局状态：Redux Toolkit，切片位于 `src/store/slice/`。
  - `layout`：布局状态
  - `route`：权限路由
  - `setting`：系统设置
  - `user`：用户状态
- 组件局部状态：React hooks。
- 同一模块不混用 Redux、Context、useState 多套方案处理同一份数据。

### 5. 路由

- `src/router/constantRoutes.ts`：常量路由（登录、404 等）。
- `src/router/createAppRouter.ts`：根据后端权限路由构建完整路由表。
- `src/router/routers.tsx`：封装 `createBrowserRouter` / `createHashRouter` / `createMemoryRouter`，并通过 `getBlocker` / `subscribe` 实现全局导航守卫。
- 新增页面后，在对应模块的菜单配置或常量路由中注册。

### 6. API 请求

- 统一通过 `src/api/` 下的封装函数发起请求。
- axios 实例已配置拦截器（token、错误处理、响应格式化）。
- API 函数命名规范：`getXxxList`、`createXxx`、`updateXxx`、`deleteXxx`。
- 请求参数和返回类型建议定义 interface。

### 7. UI / 样式

- 优先使用 Ant Design 组件；自定义样式使用 Less 或 CSS Modules。
- 主题变量在 `src/styles/` 或 Vite 配置中管理。
- 图标使用 `@ant-design/icons`。

### 8. 类型与 Lint

- 修改代码后必须保证：
  ```bash
  pnpm -F web exec tsc --noEmit
  pnpm -F web run lint
  ```
- 只修复改动范围内的 lint/类型问题，不要批量修复无关文件。
- 避免 `any`、`as any`、`@ts-ignore`；确需使用时在同文件内加简短注释说明原因。

### 9. Vite 配置

- `vite.config.ts` 中已配置 `@/` 别名、React 插件、Ant Design 按需加载、手动分包、本地代理。
- 本地开发代理：
  - `/api` → `http://localhost:7777`
  - `/api-fund` → 东方财富基金接口
- 新增较大第三方库时，参考现有 `manualChunks` 配置添加分包规则。

## 新增页面的标准流程

1. 在 `packages/web/src/pages/<module>/` 下新建页面目录。
2. 编写 `index.tsx` 作为页面入口，必要时拆分 `components/`、`hooks/`、`types.ts`。
3. 在路由中注册（常量路由或后端权限路由）。
4. 在 `src/api/` 下新增或复用 API 函数。
5. 如需全局状态，在 `src/store/slice/` 下新增或扩展 slice。
6. 运行类型检查与 lint，确保通过。

## 注意事项

- `packages/web/dist/` 是构建产物，不要手动修改，已加入 `.gitignore`。
- `packages/web/node_modules/` 和根 `node_modules/` 由 pnpm 管理，不要手动复制依赖。
- 环境变量文件 `.env.development` / `.env.production` 可提交非敏感配置；敏感变量通过根目录 `.env` 或 CI 注入。
- 提交前确保 `pnpm -F web run type-check` 与 `pnpm -F web run lint` 通过。

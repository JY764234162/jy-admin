# 前后端对接说明

## 项目结构

- **后端**：`server/` - Go + Gin 框架
- **前端**：`web/packages/web/` - React + TypeScript + Vite

## 已完成的工作

### 1. 前端 API 请求封装

- ✅ 创建了 `src/utils/request.ts` - axios 实例和拦截器
- ✅ 创建了 `src/api/` 目录结构
- ✅ 实现了请求/响应拦截器
- ✅ 自动添加 Authorization token
- ✅ 统一错误处理

### 2. API 接口类型定义

- ✅ 创建了 `src/api/types.ts` - 所有 API 接口的 TypeScript 类型定义
- ✅ 包括登录、用户、客户、文件、角色等模块的类型

### 3. 登录功能对接

- ✅ 实现了验证码获取接口
- ✅ 实现了登录接口对接
- ✅ Token 自动存储到 localStorage
- ✅ 用户信息存储

### 4. 后端 CORS 配置

- ✅ 添加了 CORS 中间件支持跨域请求
- ✅ 配置了开发环境的允许源

### 5. 环境变量配置

- ✅ 创建了 `.env.development` 和 `.env.production` 示例
- ✅ API 基础地址可通过环境变量配置

## API 接口列表

### 登录相关

- `GET /api/login/captcha` - 获取验证码
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出（待实现）

### 用户管理

- `GET /api/user/list` - 获取用户列表
- `POST /api/user` - 创建用户
- `PUT /api/user` - 更新用户
- `DELETE /api/user/:id` - 删除用户
- `POST /api/user/changePassword` - 修改密码

### 客户管理

- `GET /api/customer/list` - 获取客户列表
- `POST /api/customer` - 创建客户
- `PUT /api/customer` - 更新客户
- `DELETE /api/customer` - 删除客户

### 文件管理

- `GET /api/upload/list` - 获取文件列表
- `POST /api/upload` - 上传文件
- `DELETE /api/upload` - 删除文件

### 角色管理

- `GET /api/authority/list` - 获取角色列表
- `POST /api/authority` - 创建角色
- `PUT /api/authority` - 更新角色
- `DELETE /api/authority` - 删除角色

## 使用示例

### 在组件中使用 API

```typescript
import { loginApi, userApi } from "@/api";

// 登录
const handleLogin = async () => {
  try {
    const res = await loginApi.login({
      username: "admin",
      password: "123456",
      code: "1234",
      code_id: "captcha-id"
    });
    console.log("登录成功", res.data);
  } catch (error) {
    console.error("登录失败", error);
  }
};

// 获取用户列表
const fetchUsers = async () => {
  try {
    const res = await userApi.getUserList({
      page: 1,
      pageSize: 10
    });
    console.log("用户列表", res.data);
  } catch (error) {
    console.error("获取用户列表失败", error);
  }
};
```

## 开发环境启动

1. **启动后端**：
   ```bash
   cd server
   go run main.go
   ```

2. **启动前端**：
   ```bash
   cd web/packages/web
   pnpm install
   pnpm dev
   ```

3. **访问**：
   - 前端：http://localhost:5173
   - 后端 API：http://localhost:7777
   - Swagger 文档：http://localhost:7777/swagger/index.html

## 注意事项

1. **Token 管理**：Token 存储在 localStorage 中，请求时自动添加到 Authorization header
2. **错误处理**：所有 API 错误都会通过 message 组件显示
3. **CORS**：开发环境已配置 CORS，生产环境需要根据实际域名配置
4. **环境变量**：确保 `.env.development` 文件存在并配置了正确的 API 地址

## 后续工作

- [ ] 实现其他业务模块的 API 对接（客户、文件、角色等）
- [ ] 添加请求重试机制
- [ ] 实现 Token 刷新机制
- [ ] 添加请求缓存
- [ ] 完善错误处理逻辑


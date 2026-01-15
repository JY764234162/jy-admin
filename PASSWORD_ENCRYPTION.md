# 密码加密方案说明

## 当前实现

### 后端加密方案

项目统一使用 **bcrypt** 算法进行密码加密和验证：

1. **注册时**：使用 `utils.BcryptHash()` 加密密码后存储到数据库
2. **登录时**：使用 `utils.BcryptCheck()` 验证用户输入的密码与数据库中的哈希值

### 加密流程

```
用户输入密码 → 后端接收 → bcrypt 加密 → 存储到数据库
用户登录 → 输入密码 → 后端接收 → bcrypt 验证 → 返回结果
```

## 为什么前端不加密密码？

### 最佳实践

**前端不应该加密密码**，原因如下：

1. **HTTPS 保护传输**：使用 HTTPS 时，密码在传输过程中已经被加密，无需前端再次加密
2. **安全性**：前端加密的代码是公开的，攻击者可以看到加密算法，无法提供真正的安全保护
3. **标准做法**：业界标准做法是前端明文传输（通过 HTTPS），后端使用单向哈希算法（如 bcrypt）存储

### 如果确实需要前端加密（不推荐）

如果您的项目有特殊需求，可以在前端添加额外的传输层加密（如 MD5 或 SHA256），但这只是**额外的安全层**，不是必需的：

```typescript
// 示例：前端 MD5 加密（不推荐，仅作演示）
import CryptoJS from 'crypto-js';

const encryptedPassword = CryptoJS.MD5(password).toString();
```

**注意**：即使前端加密，后端仍然需要使用 bcrypt 再次加密存储。

## 当前实现细节

### 后端代码

1. **注册接口** (`server/api/login/register.go`)：
   ```go
   user.Password = utils.BcryptHash(params.Password)
   ```

2. **登录接口** (`server/api/login/login.go`)：
   ```go
   if !utils.BcryptCheck(params.Password, user.Password) {
       // 密码错误
   }
   ```

3. **工具函数** (`server/utils/hash.go`)：
   - `BcryptHash()`: 使用 bcrypt 加密密码
   - `BcryptCheck()`: 验证密码与哈希值是否匹配

### 数据库存储

- 密码以 bcrypt 哈希值形式存储
- 哈希值格式：`$2a$10$...`（bcrypt 标准格式）
- 无法从哈希值反推出原始密码

## 安全建议

1. ✅ **使用 HTTPS**：确保生产环境使用 HTTPS 传输
2. ✅ **密码强度**：要求用户设置强密码（至少6位，建议包含字母、数字、特殊字符）
3. ✅ **bcrypt Cost**：当前使用 `bcrypt.DefaultCost`（10），可根据服务器性能调整
4. ✅ **密码重置**：实现密码重置功能时，使用临时令牌而非明文密码

## 测试

1. **注册新用户**：密码会被 bcrypt 加密存储
2. **登录**：使用明文密码登录，后端会自动验证
3. **数据库查看**：密码字段显示为 bcrypt 哈希值，无法直接读取

## 注意事项

- 现有数据库中的明文密码需要重新设置或迁移
- 如果数据库中有旧数据，需要：
  1. 删除旧用户重新注册，或
  2. 编写迁移脚本将明文密码转换为 bcrypt 哈希


---
name: python-api-crud-autotest
description: 使用 Python 自动化测试指定模块的接口功能（重点覆盖列表增删改查 CRUD）并输出可追踪报告。Use when the user asks for API automation, CRUD testing, pytest interface test, regression test, list create/update/delete/query verification, or test data isolation.
---

# Python 接口 CRUD 自动化测试 (Python API CRUD AutoTest)

## 目标 (Goal)
为指定模块快速落地可运行、可复用、可回归的 Python 接口自动化测试，重点覆盖列表场景的增删改查（CRUD）。

## 适用场景 (When to Use)
- 用户要求“写接口自动化测试脚本”。
- 需要验证某个模块的列表查询、新增、编辑、删除是否正确。
- 需要一套可持续回归的测试结构，而不是一次性脚本。

## 默认技术选型 (Default Stack)
- 测试框架：`pytest`
- HTTP 客户端：`httpx`（或项目已存在 `requests` 时沿用）
- 报告：`pytest-html`（如项目已启用）
- 数据组织：`pytest fixture` + 工厂函数（factory）

## 工作流 (Workflow)
1. 明确接口契约：`base_url`、认证方式、CRUD 路径、请求参数、响应结构、业务码规则。
2. 建立测试骨架：`tests/api/<module>/`，拆分为 `test_list.py`、`test_create.py`、`test_update.py`、`test_delete.py`。
3. 实现通用客户端：统一处理 token、超时、重试、日志、错误输出。
4. 构建测试数据：使用唯一标识（时间戳/uuid）生成数据，避免污染。
5. 编排 CRUD 链路：Create -> Query -> Update -> Query -> Delete -> Query。
6. 加入清理逻辑：`teardown` 或最终清理步骤，保证可重复执行。
7. 输出测试报告：失败时打印请求/响应关键字段，便于定位。

## 强约束 (Hard Rules)
- 失败断言必须包含：HTTP 状态码 + 业务码 + 关键字段校验。
- 禁止把测试写成强依赖执行顺序的“单大用例”；优先独立用例 + 共享 fixture。
- 每个写操作（create/update/delete）至少有 1 个异常分支断言。
- 测试数据必须隔离，不复用线上真实业务数据。

## 优化策略 (Optimization)
- 对不稳定网络加“有限重试”（仅请求层，断言失败不重试）。
- 通过 fixture 复用登录 token，避免每条用例重复登录。
- 对慢接口添加 `timeout` 与性能阈值断言（可选）。
- 支持环境切换：`dev/test/staging` 通过环境变量控制。
- 对列表查询增加分页边界校验：第一页、空页、越界页。

## 推荐目录 (Suggested Layout)
```text
tests/
  api/
    <module>/
      conftest.py
      test_list.py
      test_create.py
      test_update.py
      test_delete.py
  utils/
    api_client.py
    data_factory.py
    assert_helper.py
```

## 最小验证清单 (Checklist)
- [ ] 列表查询：默认分页、筛选条件、排序字段
- [ ] 新增：成功新增 + 重复数据/非法数据失败
- [ ] 编辑：成功编辑 + 目标不存在失败
- [ ] 删除：成功删除 + 重复删除/不存在失败
- [ ] 删除后查询：目标已不可见或状态符合预期

## 输出模板 (Output Template)
使用以下格式汇报测试结果：

```markdown
# API 自动化测试报告 - <模块名>

## 1. 测试范围
- 覆盖接口：
- 环境：

## 2. 用例结果
- 总数：
- 通过：
- 失败：

## 3. 失败明细
- 用例：
  - 请求：
  - 响应：
  - 断言失败点：

## 4. 风险与建议
- 风险：
- 建议：
```

## 快速触发示例 (Prompt Examples)
- “按 `python-api-crud-autotest` 给用户管理模块写 CRUD 接口自动化测试”
- “用 pytest + httpx 帮我落地订单列表增删改查接口回归脚本”
- “针对商品模块接口做自动化，要求可复跑并输出 markdown 报告”

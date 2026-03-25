---
name: api-contract-integration
description: 实现前端接口联调，确保 request/response 类型稳定与错误处理健壮。Use when the user asks for API integration, 接口对接, data fetching, form submit, pagination, retry/timeout, or backend contract alignment.
---

# 接口契约联调 (API Contract Integration)

## 目标 (Goal)
安全、可预期地将前端功能接入后端 API。

## 工作流 (Workflow)
1. 确认 endpoint contract：params、payload、response fields、status semantics。
2. 在 API 边界定义或收敛 TypeScript 类型。
3. 使用项目既有请求封装实现 request call。
4. 只在必要位置做 response -> UI model 映射，避免全局类型污染。
5. 补齐 loading/error/empty 状态与用户可感知反馈。

## 错误处理基线 (Error Handling Baseline)
- 区分 business failure 与 network/timeout failure。
- 错误提示要可执行，并与现有产品文案一致。
- pending 状态下防止重复 submit/actions。

## 分页与查询规则 (Pagination and Query Rules)
- query params 保持单一数据源（通常为页面状态）。
- filters/search terms 变化时重置 pagination。
- 若项目已支持，则在 refresh/navigation 后保留当前查询态。

## 完成标准 (Done Criteria)
- API calls 与契约一致，并遵循既有 request wrapper 风格。
- 不存在 silent failure 路径。
- request/response 边界类型清晰可见。

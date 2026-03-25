---
name: react-page-delivery
description: 在现有项目中以最小改动实现 React + TypeScript 页面开发与改造。Use when the user asks for 页面开发, UI模块新增, list/detail/table/search/filter, page refactor, or frontend view implementation.
---

# React 页面交付 (React Page Delivery)

## 目标 (Goal)
在遵循项目既有规范的前提下，最小范围完成 React + TypeScript 页面需求。

## 工作流 (Workflow)
1. 先确认目标 route/page，并找到项目内相似页面作为参照。
2. 优先复用现有 UI 模式（layout/form/table/modal/message），再考虑抽象。
3. 按最小可运行切片实现：静态结构 -> 数据流 -> 交互逻辑。
4. 状态优先本地管理，只有跨页共享时才上提。
5. 异步页面必须覆盖 empty/loading/error states。

## 实施规则 (Implementation Rules)
- 保持现有 aliases/import 风格与命名习惯。
- 避免 `any` 扩散；在数据边界处定义类型（API response, form model, props）。
- 组件职责保持单一；只有真实复用时再提取 hooks/utils。
- 同一任务内不做无关重构 (unrelated refactor)。

## 完成标准 (Done Criteria)
- 页面行为符合需求且与既有 UX 风格一致。
- 改动范围内 `type-check` 与 `lint` 可通过。
- diff 聚焦在请求功能，无额外噪音修改。

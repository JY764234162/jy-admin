---
name: frontend-quality-gate
description: 在提交前执行前端交付质量清单，确保改动可合并。Use when the user asks for 自检/走查, merge-ready check, React/TypeScript verification, pre-commit validation, or regression risk reduction.
---

# 前端质量闸门 (Frontend Quality Gate)

## 目标 (Goal)
通过轻量、统一的清单确保前端改动达到可合并状态。

## 检查清单 (Checklist)
- Requirement aligned：交付范围与需求一致，无 unrelated refactor。
- Type safety：不存在失控 `any`，关键路径有类型约束。
- UX states：loading/error/empty/success 状态完整且不冲突。
- Interaction safety：pending 状态下防止重复 submit/click。
- Compatibility：改动遵循现有代码风格与组件模式。
- Quality commands：对改动包执行相关 `type-check` 与 `lint`。

## 输出格式 (Review Output Format)
完成汇报时包含：
1. 改了什么（feature/bugfix）。
2. 验证了什么（paths 与行为）。
3. 剩余风险或未覆盖场景。

## 完成标准 (Done Criteria)
- checklist 项有明确勾检结论。
- 若有未执行验证，需明确说明原因。

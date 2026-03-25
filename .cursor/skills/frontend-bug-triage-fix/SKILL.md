---
name: frontend-bug-triage-fix
description: 系统化复现、定位并修复前端问题，尽量降低回归风险。Use when the user asks for bug triage, debug UI issue, 交互异常修复, state inconsistency, rendering bug fix, or frontend troubleshooting.
---

# 前端问题排查修复 (Frontend Bug Triage Fix)

## 目标 (Goal)
通过可复现、可验证的方式修复用户可见前端问题。

## 工作流 (Workflow)
1. 明确复现条件，记录 expected vs actual behavior。
2. 快速收敛范围：route/component/state/API layer。
3. 先找 root cause 再改代码，避免猜测式多文件改动。
4. 对真实故障点打最小补丁 (minimal patch)。
5. 验证主路径 + 至少一个邻近 edge case，降低回归风险。

## 排查优先级 (Debug Priorities)
- Event flow mismatch（click/change/submit handlers）。
- State sync issues（stale closures, dependency lists, async race）。
- Data contract mismatch（undefined/null shape drift）。
- Conditional rendering errors（loading/error/empty overlap）。

## 修复规则 (Fix Rules)
- 优先 deterministic fix，避免 timing hacks。
- 新增 guards/fallbacks 时保持显式且有类型约束。
- 保留既有 UX 文案与交互节奏。

## 完成标准 (Done Criteria)
- 复现 case 已被解决。
- 邻近流程无明显回归。
- 最终说明包含 root cause 与修复影响。

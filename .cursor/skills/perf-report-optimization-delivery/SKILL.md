---
name: perf-report-optimization-delivery
description: 基于已有性能报告执行前端性能优化并验证收益。Use when the user asks for performance optimization from report findings, hotspot fix, render/perf refactor, regression benchmark, or performance improvement delivery.
---

# 性能报告驱动优化交付 (Perf Report Optimization Delivery)

## 目标 (Goal)
基于性能报告中的热点证据，完成可验证的性能优化改造，而不是只给建议不落地。

## 输入要求 (Required Inputs)
- 至少一份性能报告（Markdown 或 profiling summary）。
- 最好同时提供 raw profile 路径（如 `cpu-profile-*.json`）用于二次核验。
- 需要明确目标场景：页面、操作路径、性能目标（如输入响应、首交互、滚动流畅度）。

## 工作流 (Workflow)
1. 解析报告结论，提取 Top hotspots 与对应调用链。
2. 校验证据可信度：必要时回看 raw profile 的 hitCount/samples。
3. 定义优化范围：只改与热点直接相关代码，避免扩散重构。
4. 设计改造方案：先 P0（高收益低风险），再 P1/P2。
5. 实施代码改造：保持行为一致，补齐类型与错误兜底。
6. 复测并对比：同场景重新 profiling，输出前后 delta。

## 优化优先级策略 (Prioritization)
- P0：高耗时且可快速收敛的热点（如同步重计算、重复渲染、阻塞主线程逻辑）。
- P1：中等收益改造（缓存、拆分、延迟加载、按需计算）。
- P2：结构性优化（架构层重构、长期治理项）。

## 常见改造动作 (Playbook)
- 将非关键首屏逻辑改为延迟执行（idle/interaction 后触发）。
- 将重计算从 render 路径移出，使用 memoization 或预计算缓存。
- 避免重复触发昂贵副作用（effect 去抖、依赖收敛、幂等保护）。
- 拆分大组件，减少无关子树重渲染。
- 对高频交互引入节流/防抖并保持 UX 可接受。

## 回归验证规则 (Verification Rules)
- 复测场景必须与报告场景一致（同页面、同操作、同采样窗口）。
- 对比至少包含：
  - hotspot hitCount 变化
  - self/total time 变化
  - 用户体感指标（输入延迟、首响应时间、掉帧感知）
- 若收益不达预期，需要说明原因并给下一轮优化方向。

## 输出模板 (Output Template)
按以下结构输出：

```markdown
# 性能优化交付报告 - <页面/模块>

## 1. 优化目标
- 来源报告：
- 目标热点：
- 期望收益：

## 2. 改造内容
- 改造点 A：
  - 原问题：
  - 改造方式：
  - 影响范围：
- 改造点 B：
  - 原问题：
  - 改造方式：
  - 影响范围：

## 3. 结果对比（Before vs After）
- hotspot 1：
  - before：
  - after：
  - delta：
- hotspot 2：
  - before：
  - after：
  - delta：

## 4. 风险与回归
- 潜在风险：
- 回归验证结果：

## 5. 下一步计划
- P1/P2 待优化项：
```

## 完成标准 (Done Criteria)
- 至少完成一个热点的可验证优化（代码 + 复测数据）。
- 输出包含 before/after 对比，不接受仅文字描述“感觉变快”。
- 改动通过项目基础校验（相关 lint/type-check）。

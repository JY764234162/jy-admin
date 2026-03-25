---
name: chrome-devtools-perf-report
description: 使用 Chrome DevTools MCP 采集前端性能数据并输出 Markdown 报告。Use when the user asks for performance profiling, 页面卡顿分析, CPU hotspot analysis, render lag, or markdown performance report generation.
---

# Chrome DevTools 性能报告 (Chrome DevTools Perf Report)

## 目标 (Goal)
通过浏览器性能采样拿到可追溯证据，输出可执行的 Markdown 性能报告，而不是仅凭体感给建议。

## 适用场景 (When to Use)
- 用户反馈页面卡顿、输入延迟、动画掉帧、交互响应慢。
- 需要比较优化前后性能差异并形成结论。
- 需要给出可复现的性能分析文档用于评审/复盘。

## 工作流 (Workflow)
1. 明确分析范围：页面 URL、关键操作路径、性能目标（如首交互、滚动、输入响应）。
2. 进入页面并稳定复现：先完成登录/预热，再执行目标交互。
3. 启动 CPU profiling：围绕关键交互进行采样并结束 profiling。
4. 读取日志文件：同时查看 `cpu-profile-*.json` 与 `cpu-profile-*-summary.md`。
5. 交叉验证：用原始 JSON 中的 sample/hitCount 佐证 summary 结论，避免误判。
6. 输出 Markdown 报告：结论、证据、优化建议、风险与回归计划。

## 数据与证据规则 (Evidence Rules)
- 不只看 summary，必须校验 raw profile。
- 关键证据至少包含：
  - 高耗时函数名（functionName）
  - 命中样本（hitCount 或 samples 规模）
  - 触发场景（用户操作步骤）
- 若无法稳定复现，需在报告中明确说明不确定性来源。

## 报告模板 (Markdown Template)
按以下结构输出：

```markdown
# 性能分析报告 - <页面/模块名>

## 1. 背景与目标
- 分析对象：
- 复现路径：
- 目标指标：

## 2. 采样方式
- 采样工具：Chrome DevTools MCP CPU Profile
- 采样时间窗口：
- 操作步骤：

## 3. 关键发现
- 发现 1：
  - 证据：
  - 影响：
- 发现 2：
  - 证据：
  - 影响：

## 4. 优化建议（按优先级）
1. P0：
2. P1：
3. P2：

## 5. 风险与验证计划
- 风险：
- 回归验证步骤：

## 6. 结论
- 当前瓶颈：
- 预期收益：
```

## 完成标准 (Done Criteria)
- 报告为 Markdown 且结构完整。
- 每个结论都有性能采样证据支撑。
- 给出可执行优化项与验证路径，不输出泛化建议。

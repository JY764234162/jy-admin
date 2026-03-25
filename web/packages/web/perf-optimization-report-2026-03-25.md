# 性能优化交付报告 - 登录页水印链路

## 1. 优化目标
- 来源报告：`web/packages/web/perf-report-2026-03-25.md`
- 目标热点：`toDataURL`（调用链：`renderWatermark -> drawCanvas -> toDataURL`）
- 期望收益：降低登录页初始化阶段的同步主线程开销，去除首屏非必要水印渲染热点。

## 2. 改造内容

### 改造点 A：登录页不挂载全局 `Watermark` 组件（P0）
- 原问题：
  - `App.tsx` 无条件包裹 `Watermark`，导致登录页初始化也触发水印绘制链路。
- 改造方式：
  - 在 `App.tsx` 增加 `isLoginPage` 判定。
  - 仅在 `settings.watermark.visible && !isLoginPage` 时渲染 `Watermark`。
  - 关闭水印或登录页场景下直接渲染业务内容，不挂载 `Watermark` 容器。
- 影响范围：
  - `src/App.tsx`（最小改动，未改业务路由与状态结构）。

## 3. 结果对比（Before vs After）

采样口径：
- Before：`/Users/jiangyi/.cursor/browser-logs/cpu-profile-2026-03-25T03-42-52-373Z-tz0kv4.json`
- After：`/Users/jiangyi/.cursor/browser-logs/cpu-profile-2026-03-25T03-50-39-320Z-nug5tc.json`
- 场景：登录页 reload 后等待稳定。

### hotspot 1：`toDataURL`
- before：
  - samples: `7440`
  - hitCount: `43`
  - summary self time: `57.0ms`（Top1）
- after：
  - samples: `14083`
  - hitCount: `0`
  - 不再出现在 Top Functions 列表
- delta：
  - hitCount: `43 -> 0`（-100%）
  - 归一化命中（每 1000 samples）：`5.78 -> 0`

### hotspot 2：初始化主要热点迁移
- before：
  - 主要热点聚焦在 `toDataURL`。
- after：
  - 热点转为 `parse`、`getClips`、`renderWithHooks`、`insertBefore` 等通用渲染/样式链路。
- delta：
  - 已消除原始“水印画布导出”单点瓶颈；后续可继续针对渲染链路做 P1 优化。

## 4. 风险与回归
- 潜在风险：
  - 登录页不再显示水印（该行为为有意优化策略，需与产品预期对齐）。
  - 非登录页仍会渲染水印，若复杂页面仍有性能压力，需进一步按需延迟。
- 回归验证结果：
  - `pnpm run type-check` 通过。
  - `pnpm -F web run lint` 通过（warning 仍为历史存量）。

## 5. 下一步计划
- P1：
  - 对非登录页水印渲染做“首屏后延迟挂载”（如 idle 后挂载）。
  - 针对 `parse`/`renderWithHooks` 热点页面做二次 profiling（建议从 AI 页面开始）。
- P2：
  - 建立固定性能基线脚本：同页面同动作定期采样并记录 delta。


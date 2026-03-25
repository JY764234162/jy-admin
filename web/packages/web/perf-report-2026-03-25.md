# 性能分析报告 - jy-admin web（登录页首轮渲染）

## 1. 背景与目标
- 分析对象：`web/packages/web` 前端应用（Vite 本地开发环境）。
- 访问地址：`http://localhost:3000/login`。
- 分析目标：定位当前可复现页面的 CPU 热点，输出可执行优化方向。

## 2. 采样方式
- 采样工具：Chrome DevTools MCP CPU Profile。
- 采样窗口：约 `9.86s`。
- 采样动作：页面 reload 后等待稳定（无额外交互）。
- 产物文件：
  - Raw Profile: `/Users/jiangyi/.cursor/browser-logs/cpu-profile-2026-03-25T03-42-52-373Z-tz0kv4.json`
  - Summary: `/Users/jiangyi/.cursor/browser-logs/cpu-profile-2026-03-25T03-42-52-373Z-tz0kv4-summary.md`

## 3. 项目概览（本次分析相关）
- 技术栈：React 18 + TypeScript + Vite 7 + Ant Design 5。
- 代码结构：`src/pages` 为页面层，`src/components` 为通用组件，存在较多实验性页面模块。
- 工程状态：`type-check` 可通过；`lint` 当前仍存在较多 warning（非阻断）。

## 4. 关键发现

### 发现 A：首轮渲染 CPU 压力整体不高，但启动期有单点热点
- 证据：
  - Total Samples: `7440`
  - Active Samples: `199`（约 `2.7%`）
  - Idle Samples: `7241`（约 `97.3%`）
- 影响：整体 CPU 利用率偏低，说明“持续卡顿”风险不高；问题更可能集中在初始化瞬时路径。

### 发现 B：`toDataURL` 是最显著热点（疑似水印/画布初始化链路）
- 证据（raw + summary 交叉）：
  - raw profile 命中：`toDataURL` `43` hits（仅次于 idle/program）
  - summary 中 Self Time Top1：`toDataURL` `57.0ms`
  - 调用路径显示：`commitHookEffectListMount -> renderWatermark -> drawCanvas -> toDataURL`
- 影响：该链路在首屏初始化执行，会放大低端设备或复杂页面的首交互延迟。

### 发现 C：存在一定框架与样式计算开销，但量级较小
- 证据：
  - `__copyProps`、`renderWithHooks`、`insertBefore` 等函数有少量聚集
  - 分类统计中 Parsing/DOM Layout 占比有限（分别约 `5.5%` / `3.0%`）
- 影响：当前非主瓶颈，优先级低于 `toDataURL` 链路优化。

## 5. 优化建议（按优先级）
1. P0：延迟或条件化执行 `toDataURL` 相关逻辑  
   - 对非关键路径（如水印、导出预处理）改为首屏后异步执行。
   - 若业务允许，仅在需要导出/预览时触发，而非页面初始化触发。
2. P1：降低重复计算与重复挂载成本  
   - 对初始化阶段的重计算逻辑加缓存（memoization）或一次性标记。
   - 避免同一渲染周期重复触发 canvas 生成。
3. P2：建立固定回归基线  
   - 以同一页面同一动作固定采样窗口，记录每次优化前后 `toDataURL hits/self time` 变化。

## 6. 风险与验证计划
- 风险：
  - 本次采样页面为登录页，且浏览器快照未捕获到可交互节点，结论偏“初始化路径”。
  - 未覆盖复杂业务页（如 AI 页面流式渲染、大表格页）。
- 回归验证步骤：
  1. 对目标优化点改造后，重复同样 reload 采样流程。
  2. 对比 `toDataURL` hitCount 与 self time 是否明显下降。
  3. 再补一轮业务页交互采样（输入、滚动、消息流式更新）。

## 7. 结论
- 当前项目在登录页场景下不存在持续高 CPU 占用问题。
- 主要可优化点集中在初始化阶段的 `toDataURL` 调用链路。
- 建议先做 P0 改造，再用同口径 profile 做前后对比，形成量化收益闭环。


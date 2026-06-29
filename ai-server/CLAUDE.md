# ai-server/CLAUDE.md

本文件为 Claude Code 操作 `ai-server/`（AI 服务）模块提供的专项指南。根目录 `../CLAUDE.md` 中的全局约定（中文输出、最小改动、禁止提交密钥等）仍然适用。

## 模块定位

`ai-server/` 是 JY-Admin 的 AI 服务，基于 **FastAPI + LangGraph/LangChain**，提供基于 RAG 的知识库问答、多轮会话持久化、流式 SSE 响应。当前架构为 **Supervisor 主控 + Plan-and-Execute 执行 + 专业化 Worker 分工**。

## 技术栈

- **Web 框架**：FastAPI
- **Agent 框架**：LangGraph + LangChain
- **LLM**：OpenAI 兼容接口（通过 `langchain.chat_models.init_chat_model`）
- **向量数据库**：PostgreSQL + pgvector（生产），SQLite 可回退（`USE_SQLITE=true`）
- **文件存储**：腾讯云 COS
- **依赖管理**：uv（`pyproject.toml` + `uv.lock`）
- **测试**：pytest + pytest-asyncio

## 目录结构

```text
ai-server/
├── main.py                         # FastAPI 入口：注册中间件、路由、生命周期钩子
├── config.py                       # 环境变量与配置集中地
├── .env                            # 敏感环境变量（不提交）
├── pyproject.toml                  # Python 项目配置与依赖
├── uv.lock                         # uv lock 文件
├── routers/                        # FastAPI 路由
│   ├── chat.py                     # 流式对话接口（SSE）
│   ├── conversation.py             # 会话 CRUD 与消息列表
│   ├── knowledge.py                # 文档上传、解析 SSE、Embedding、向量检索
│   └── upload.py                   # 聊天附件上传 COS（不向量化）
├── services/                       # 业务核心
│   ├── agent_graph/                # LangGraph Agent 主模块
│   │   ├── core.py                 # StateGraph 组装与对外流式接口
│   │   ├── state.py                # AgentState、PlanStep、StepResult 等类型
│   │   ├── prompts.py              # 所有 system prompt 模板
│   │   ├── nodes.py                # summarize_node、ensure_placeholder_node、cleanup_node
│   │   ├── message_helpers.py      # 消息辅助函数
│   │   ├── tools_node.py           # 工具工厂
│   │   ├── tracing.py              # LangSmith tracing helper
│   │   ├── supervisor/             # Supervisor 多意图识别
│   │   ├── planner/                # Plan-and-Execute 规划与执行
│   │   ├── quality/                # 质量检查与计划重 refinement
│   │   └── workers/                # 专业化 Worker
│   ├── chat/                       # 会话业务逻辑
│   ├── conversation/               # 会话持久化
│   ├── llm/                        # LLM 实例
│   ├── middleware/                 # 中间件
│   ├── rag/                        # 文档解析、分块、Embedding、语义记忆
│   ├── storage/                    # 向量存储、checkpoint 存储、长期记忆
│   ├── streaming/                  # 流缓冲、Graph 执行器、断线恢复
│   └── tools/                      # 知识库与联网搜索工具
├── tests/
│   └── agent_graph/                # Agent 图测试套件
├── uploads/                        # 临时上传目录（不提交）
└── vector_data/                    # SQLite 向量数据（不提交）
```

## 常用命令

```bash
cd ai-server

# 安装依赖
uv sync

# 本地运行（加载根目录 .env 环境变量）
uv run python main.py
# 或激活虚拟环境后
python main.py

# 运行测试
uv run pytest tests/agent_graph/ -v

# 单独运行某个测试文件
uv run pytest tests/agent_graph/test_planner.py -v
```

- 本地接口：`http://localhost:8000`
- 健康检查：`GET /api/health`
- 路由前缀：`/api/ai/chat`、`/api/ai/conversation`、`/api/ai/knowledge`、`/api/ai/upload`

## Agent 架构（Supervisor + Plan-and-Execute）

主图拓扑：

```text
supervisor → ensure_placeholder → supervisor_router
        ├─ chat_intent        → chat_worker        → END
        ├─ single_intent      → direct_worker      → END
        └─ complex_intent     → planner_node → plan_executor（按依赖执行 Worker）
                                                    → synthesis_worker
                                                    → quality_check
                                                          ├─ 通过 → END
                                                          └─ 未通过 → plan_refinement → plan_executor
```

### 各节点职责

- **supervisor**（`services/agent_graph/supervisor/`）：多意图识别 + 任务复杂度评估 + 路由决策。输出结构化 `IntentAnalysis`，支持 10+ 种意图。
- **planner**（`services/agent_graph/planner/`）：复杂任务生成显式 `PlanStep[]`；`plan_executor` 按依赖关系调度 Worker，并有 `plan_execution_count` 上限保护。
- **workers**（`services/agent_graph/workers/`）：
  - `chat_worker`：纯闲聊，无工具
  - `direct_worker`：单意图快速执行
  - `knowledge_worker`：知识库检索 ReAct 循环
  - `search_worker`：联网搜索 ReAct 循环
  - `synthesis_worker`：整合多 Worker 结果
- **quality**（`services/agent_graph/quality/`）：质量检查 + 计划重 refinement（最多 2 次）。
- **summarize_node**：消息数超过 `MAX_RAW_MESSAGES` 时自动触发会话摘要。
- **cleanup_node**：每轮结束清理中间状态（plan、step_results 等），保留 `messages` 与 `summary`。

### 对外接口

`services/agent_graph/core.py` 暴露以下函数，签名保持稳定，前端无需随内部图结构变化而改动：

- `prepare_turn` / `prepare_human_turn`：写入用户消息 + 占位 AI
- `patch_last_human_message`：补全末条用户消息（txt 附件正文）
- `stream_agent`：主流程式 SSE
- `stream_agent_resume`：断线恢复流式输出

## 开发约定

### 1. 流式输出

- 所有 Worker 节点函数签名必须接收 `config: RunnableConfig | None = None`，并通过 `get_runnable_config(config)` 传递给 LLM，确保父级 streaming callbacks 被保留，否则 SSE 会被聚合成单条。
- 工具调用统一通过 `services/agent_graph/workers/utils.py` 的 `run_single_tool_loop`，限制 `max_iterations=2`。

### 2. Prompt 工程

- 所有 system prompt 模板集中在 `services/agent_graph/prompts.py`。
- 节点在组装 prompt 时，通过 `message_helpers.format_current_datetime_context()` 注入当前时间，避免 LLM 依赖 knowledge cutoff。
- 角色固定为「芳芳，智能学习顾问」，统一使用中文，禁止提及工具名称或调用过程。

### 3. 状态管理

- `AgentState` 定义在 `state.py`，新增字段时注意：
  - checkpoint 兼容：保留旧字段（`messages`、`summary`、`intent`、`iterations`、`rewrite_query`）。
  - 中间产物字段在 `cleanup_node` 中清理，避免 checkpoint 膨胀。
- LLM 调用失败有兜底：supervisor 回退 `other`，planner 回退单步计划，quality_check 回退 `passed=True`。

### 4. 配置与密钥

- 敏感信息（COS 密钥、AI API Key、JWT 密钥、数据库密码）放在根目录 `.env`，已加入 `.gitignore`。
- `config.py` 通过 `os.getenv` 读取，并提供默认值。
- 与 Go 后端共用同一个 `JWT_SIGNING_KEY`，由 `services/middleware/` 校验。

### 5. 测试

- 测试位于 `tests/agent_graph/`，覆盖 supervisor、planner、workers、quality、graph_build、tracing、state。
- 修改 Agent 相关代码后运行：
  ```bash
  uv run pytest tests/agent_graph/ -v
  ```
- 测试使用 mock LLM，新增节点时建议补充对应单元测试。

### 6. 数据存储

- **PostgreSQL + pgvector**：向量数据（`ai_vectors`）。
- **LangGraph checkpoint**：AsyncPostgresSaver，对话短期记忆。
- **SQLite 回退**：本地无 PostgreSQL 时用 `USE_SQLITE=true`。
- **腾讯云 COS**：文档与附件存储。

## 新增节点的标准流程

1. 在 `services/agent_graph/` 下选择合适子模块（supervisor / planner / workers / quality）。
2. 实现 node 函数，签名接收 `state: AgentState, config: RunnableConfig | None = None`。
3. 必要时在 `state.py` 扩展 `AgentState` 字段，并在 `cleanup_node` 清理中间产物。
4. 在 `prompts.py` 新增对应 system prompt。
5. 在 `core.py` 的 `_build_graph` 中注册节点和边。
6. 在 `tests/agent_graph/` 补充单元测试。
7. 运行 `uv run pytest tests/agent_graph/ -v` 确认无回归。

## 注意事项

- `uploads/`、`vector_data/`、`.venv/`、`.pytest_cache/` 为运行时产物，不要提交。
- 修改图拓扑后，注意 graph 缓存 key（`user_id, enable_knowledge, enable_search, system_prompt`），避免使用旧缓存。
- 新增第三方依赖后，运行 `uv add <pkg>` 更新 `pyproject.toml` 和 `uv.lock`。
- 涉及 token 流式输出的改动，务必人工验证 SSE 是否逐段输出，而非一次性返回。

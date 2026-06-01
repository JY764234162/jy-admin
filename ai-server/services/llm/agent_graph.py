"""Agent 流式 SSE 输出。

【架构说明：LangGraph StateGraph + 自动摘要机制】
--------------------------------------------------------------------------------
本方案在标准 StateGraph 基础上增加了会话摘要功能，解决历史对话过多时的
上下文窗口溢出问题。

【短期记忆三层结构】
  1. 完整历史 → checkpoint 持久化到 PostgreSQL（长期存档）
  2. 会话摘要 → 对早期对话的压缩摘要，随状态自动保存
  3. 近期原始 → 最近 MAX_RAW_MESSAGES 条消息直接传入 LLM

【自动摘要触发流程】
  agent 生成回复后 → 检查消息数量
      ↓ 超过阈值
  调用 summarize 节点 → LLM 生成摘要 → 更新 state.summary
      ↓
  下次请求时，agent 节点将摘要拼入 system prompt
--------------------------------------------------------------------------------
"""

import asyncio
import json
from typing import Annotated, AsyncIterator, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from services.storage.checkpoint_store import get_saver
from services.tools.knowledge_tools import make_list_knowledge_tool, make_search_knowledge_tool
from services.tools.search_tools import make_tavily_search_tool
from .llm import llm, summary_llm
from .response_filter import sanitize_response


# ========== 摘要配置 ==========

# 保留的原始消息条数（超过后触发摘要）
# 按对话轮数估算：一轮 ≈ 2 条（user + AI），10 条 ≈ 5 轮
MAX_RAW_MESSAGES = 10


# ========== 动态系统提示词构建 ==========

def build_system_prompt(enable_knowledge: bool = True, enable_search: bool = False) -> str:
    """根据实际挂载的工具动态构建系统提示词基础部分。

    【注意】这里只构建不含摘要和长期记忆的"基础"提示词。
    摘要和长期记忆会在 agent 节点中动态拼接，确保每次都能拿到最新的。
    """
    tools_desc = []
    rules = []

    if enable_knowledge:
        tools_desc.extend([
            "- **search_knowledge**：查询用户上传的文档内容",
            "- **list_knowledge**：列出用户知识库中的文档",
        ])
        rules.append("只要问题涉及文档内容或知识库中的信息，必须调用 search_knowledge 工具。")

    if enable_search:
        tools_desc.append("- **tavilysearch**：联网搜索互联网上的最新信息")
        rules.extend([
            "只要问题涉及时效性信息（'今天''最近''最新''新闻''天气''股价'等），必须调用 tavilysearch 工具，禁止凭记忆回答。",
            "历史消息中的旧搜索结果可能已经过期，每次回答涉及时效性问题时必须重新调用工具，不得依赖历史中的旧数据。",
        ])
    else:
        rules.append(
            "你**没有**联网搜索能力。对于涉及时效性的问题，请诚实告知用户你无法获取实时信息，不要编造。"
        )

    rules.extend([
        "只有纯闲聊（'你好''谢谢'）才不需要工具。",
        "调用工具后，根据返回结果组织回答。不要编造未返回的信息。",
    ])

    tools_section = "\n".join(tools_desc) if tools_desc else "（当前没有可用的工具）"
    rules_section = "\n".join(f"{i + 1}. {r}" for i, r in enumerate(rules))

    search_restriction = (
        ""
        if enable_search
        else "- 你未启用联网搜索，**严禁**生成 [tavilysearch] 等工具调用标记，严禁假装执行了搜索"
    )

    return f"""你叫芳芳，是一个智能助手。

你拥有以下工具，回答用户问题时**必须**按需调用：
{tools_section}

## 核心规则
{rules_section}

## 引用规范
- 知识库内容标注：`【来源：文件名】`
- 联网搜索内容标注：正文中用 `[index]` 上标引用（如 `OpenAI 发布了新模型[1]`），回答末尾列出完整来源：`[index] [网页标题](URL)`
- 搜索结果中的图片可以用 `![描述](URL)` 展示

## 绝对禁止
- 回答中**不得**出现"我调用了""我使用了""工具返回"等描述
- 回答中**不得**提及任何工具名称
- 不得凭记忆回答涉及时效性的问题
{search_restriction}

请用中文回答。"""


# ========== SSE 辅助函数 ==========

def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 工具创建 ==========

def make_tools(user_id: str = "", enable_knowledge: bool = True, enable_search: bool = False):
    """创建已绑定 user_id 的工具列表。"""
    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id)
        tools.append(search_knowledge)
        list_knowledge = make_list_knowledge_tool(user_id=user_id)
        tools.append(list_knowledge)

    if enable_search:
        tavilysearch = make_tavily_search_tool()
        tools.append(tavilysearch)
        print(f"[AGENT] 已挂载联网搜索工具 (enable_search=True)")

    return tools


# ========== LangGraph 状态定义 ==========

class AgentState(TypedDict):
    """LangGraph 显式状态定义。

    字段说明：
      messages: 对话消息列表（含完整历史）。
                使用 add_messages reducer，多节点写入时自动追加。
      summary:  对早期对话的文本摘要。
                由 summarize 节点生成，agent 节点读取后拼入 system prompt。
    """
    messages: Annotated[list, add_messages]
    summary: str


# ========== 摘要生成 ==========

_SUMMARY_SYSTEM_PROMPT = """你是一个对话摘要助手。请对以下对话历史进行摘要，要求：
1. 保留关键信息：用户的核心需求、重要决策、已确认的方案
2. 简洁明了：控制在 300 字以内
3. 不要遗漏：待办事项、未解决的问题、用户明确要求记住的信息
4. 如果提供了已有摘要，请在原有基础上增量更新，输出完整的新摘要

请直接输出摘要内容，不要加任何前缀或解释。"""


def _generate_summary(messages: list, existing_summary: str = "") -> str:
    """调用 LLM 生成对话摘要。

    Args:
        messages: 需要被摘要的原始消息列表（较早的对话）
        existing_summary: 已有的历史摘要（增量更新时使用）

    Returns:
        生成的摘要文本
    """
    # 将消息格式化为易读的对话文本
    dialog_lines = []
    for msg in messages:
        if not hasattr(msg, "content") or not msg.content:
            continue
        role = "用户" if msg.type == "human" else "助手"
        # 截断过长的单条消息，避免摘要 prompt 过大
        content = str(msg.content)[:500]
        dialog_lines.append(f"{role}: {content}")

    dialog_text = "\n".join(dialog_lines)

    # 构建摘要请求 prompt
    prompt_parts = [_SUMMARY_SYSTEM_PROMPT]
    if existing_summary:
        prompt_parts.append(f"\n【已有摘要】\n{existing_summary}")
    prompt_parts.append(f"\n【新增对话】\n{dialog_text}\n\n【更新后的完整摘要】")

    prompt = "\n".join(prompt_parts)

    # 调用非流式 LLM 生成摘要
    # 关键：传入空回调配置，阻断 graph stream 的旁路捕获，防止摘要内容泄漏到前端
    from langchain_core.runnables import RunnableConfig
    response = summary_llm.invoke(
        [HumanMessage(content=prompt)],
        config=RunnableConfig(callbacks=[]),
    )
    return response.content.strip()


# ========== 节点函数 ==========

def _make_agent_node(enable_knowledge: bool, enable_search: bool, system_prompt: str, tools: list):
    """创建 agent 节点的工厂函数。

    使用闭包捕获构建时的配置参数（工具列表、提示词等），
    避免每次节点执行时重复计算。

    Args:
        enable_knowledge: 是否启用知识库工具
        enable_search: 是否启用联网搜索工具
        system_prompt: 外部传入的长期记忆上下文
        tools: 已创建的工具实例列表

    Returns:
        agent_node 异步函数
    """
    # 预构建基础 system prompt（只需计算一次）
    base_prompt = build_system_prompt(enable_knowledge, enable_search)

    # 预绑定工具（只需绑定一次）
    llm_with_tools = llm.bind_tools(tools) if tools else None

    def agent_node(state: AgentState) -> dict:
        """Agent 节点：动态构建 prompt 并调用 LLM。

        每次执行时按以下顺序动态拼接 system prompt：
          1. 基础系统提示词（工具说明、回答规则）
          2. 长期记忆（外部传入的 system_prompt 参数）
          3. 会话摘要（由 summarize 节点自动生成，可能为空）
          4. 最近 N 条原始消息（避免上下文溢出）

        这样 LLM 始终看到：基础规则 + 记忆 + 摘要 + 近期细节
        """
        messages = state["messages"]
        summary = state.get("summary", "")

        # 1. 组装完整 system prompt
        # 顺序：历史摘要（背景上下文）→ 基础提示词（角色/规则）→ 长期记忆（业务上下文）
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(base_prompt)
        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        # 2. 只取最近 N 条消息传入 LLM（滑动窗口）
        # checkpoint 中仍保留完整历史，但 LLM 只消费近期部分
        recent_messages = messages[-MAX_RAW_MESSAGES:]

        # 3. 构建完整消息列表：system + 近期对话
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        # 4. 调用 LLM（预绑定的工具实例或裸 LLM）
        if llm_with_tools:
            response = llm_with_tools.invoke(prompt_messages)
        else:
            response = llm.invoke(prompt_messages)

        # 5. 返回状态更新
        # LangGraph 的 add_messages reducer 会自动将 response 追加到 messages
        return {"messages": [response]}

    return agent_node


def summarize_node(state: AgentState) -> dict:
    """摘要节点：对超出的历史消息生成摘要。

    触发条件：checkpoint 中的 messages 数量超过 MAX_RAW_MESSAGES
    行为：
      - 取较早的消息生成摘要
      - 与已有摘要合并（增量更新）
      - 更新 state.summary 字段
    注意：不删除原始消息，checkpoint 保留完整历史；
          上下文截断在 agent 节点中通过滑动窗口实现。
    """
    messages = state["messages"]
    existing_summary = state.get("summary", "")

    # 需要被摘要的消息（除最近 N 条外的所有）
    to_summarize = messages[:-MAX_RAW_MESSAGES]

    # 生成新摘要
    summary = _generate_summary(to_summarize, existing_summary)

    print(f"[AGENT] 生成摘要: {len(to_summarize)} 条消息 → {len(summary)} 字摘要")

    # 只更新 summary 字段，messages 保持不变
    return {"summary": summary}


# ========== 条件边 ==========

def agent_router(state: AgentState) -> str:
    """Agent 节点后的统一路由函数。

    按优先级判断下一步走向：
      1. 最后一条消息包含 tool_calls → 需要执行工具
      2. 消息总数超过阈值 → 需要生成摘要
      3. 否则 → 流程结束

    Returns:
        "tools"     → 进入工具执行节点
        "summarize" → 进入摘要生成节点
        END         → 结束流程
    """
    last_message = state["messages"][-1]

    # 优先级 1：模型要求调用工具
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    # 优先级 2：历史消息过多，需要摘要
    if len(state["messages"]) > MAX_RAW_MESSAGES:
        return "summarize"

    # 无需特殊处理，直接结束
    return END


# ========== Graph 构建与缓存 ==========

_graph_cache: dict = {}


def _build_graph(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""):
    """构建并编译 StateGraph（含自动摘要机制）。

    与标准 StateGraph 的区别：
      - 增加 summarize 节点，自动管理历史摘要
      - agent 节点使用滑动窗口，只传入近期消息到 LLM
    """
    # 1. 创建工具列表
    tools = make_tools(user_id=user_id, enable_knowledge=enable_knowledge, enable_search=enable_search)
    tool_names = [t.name for t in tools]
    print(
        f"[AGENT] 构建 Graph: user_id={user_id}, tools={tool_names}, "
        f"enable_knowledge={enable_knowledge}, enable_search={enable_search}"
    )

    # 2. 创建 agent 节点（闭包捕获所有配置）
    agent_node = _make_agent_node(enable_knowledge, enable_search, system_prompt, tools)

    # 3. 构图
    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.set_entry_point("agent")

    # 4. 添加工具节点（如果有工具）
    if tools:
        tool_node = ToolNode(tools)
        builder.add_node("tools", tool_node)
        builder.add_edge("tools", "agent")  # 工具执行完后回到 agent 继续思考

    # 5. 添加摘要节点
    builder.add_node("summarize", summarize_node)
    builder.add_edge("summarize", END)  # 摘要完成后结束

    # 6. 统一条件边：从 agent 出发，根据状态决定走向
    routing_map = {"summarize": "summarize", END: END}
    if tools:
        routing_map["tools"] = "tools"

    builder.add_conditional_edges("agent", agent_router, routing_map)

    # 7. 编译，附加 checkpoint（对话记忆持久化）
    return builder.compile(checkpointer=get_saver())


def _get_graph(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""):
    """获取或编译 Graph 实例（按参数缓存，避免重复创建）。"""
    key = (user_id, enable_knowledge, enable_search, system_prompt)
    if key not in _graph_cache:
        print(f"[AGENT] 创建新 Graph: key={key}")
        _graph_cache[key] = _build_graph(
            user_id=user_id,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
            system_prompt=system_prompt,
        )
    else:
        print(f"[AGENT] 命中缓存 Graph: key={key}")
    return _graph_cache[key]


# ========== 主函数：流式 SSE 输出 ==========

async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 和 enable_search 动态挂载工具。
    短期记忆由 LangGraph checkpoint 自动管理，超出阈值时自动触发摘要。
    """
    print(
        f"[AGENT] stream_agent 参数: enable_knowledge={enable_knowledge}, "
        f"enable_search={enable_search}, user_id={user_id}"
    )

    # 1. 获取缓存的 Graph 实例
    graph = _get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )

    # 2. 构造当前用户消息
    if image_url:
        content = [
            {"type": "text", "text": message},
            {"type": "image", "url": image_url},
        ]
    else:
        content = message

    # 3. 初始化状态
    # 注意：只传 messages，summary 由 checkpoint 自动恢复（首次为空字符串）
    # 如果传入 summary="" 会覆盖 checkpoint 中已有的摘要！
    initial_state = {"messages": [HumanMessage(content=content)]}

    # 4. LangGraph thread 配置
    config = {"configurable": {"thread_id": thread_id}}

    # 5. 遍历 Graph 输出
    has_content = False

    for msg, metadata in graph.stream(
        initial_state, config, stream_mode="messages"
    ):
        msg_type = getattr(msg, "type", "")
        tool_calls = getattr(msg, "tool_calls", None)

        # 跳过 ToolMessage（tools 节点的输出）
        if msg_type == "tool":
            continue

        # 跳过带有有效工具调用的 AIMessage（不暴露工具调用过程给用户）
        if tool_calls and any(tc.get("name") for tc in tool_calls if tc):
            continue

        token = getattr(msg, "content", "")
        if token:
            has_content = True
            yield _sse_json({"content": sanitize_response(str(token))})
            await asyncio.sleep(0.01)

    # 6. 兜底：如果模型没有生成任何内容，返回友好提示
    if not has_content:
        yield _sse_json({"content": "抱歉，我暂时无法回答这个问题，请稍后重试。"})

    # 7. 完成
    yield _sse_json({"done": True})

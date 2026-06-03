"""Agent 流式 SSE 输出 —— 主入口。

【架构说明：LangGraph StateGraph + 自动摘要机制 + 意图路由】
--------------------------------------------------------------------------------
本文件是 Agent 的核心入口，职责单一：
  1. 组装 StateGraph（调用各子模块的节点/路由/工具工厂函数）
  2. 管理 Graph 实例缓存
  3. 对外暴露 stream_agent 流式接口

具体节点实现见：
  - state.py      → AgentState 定义
  - prompts.py    → 所有 system prompt 模板
  - nodes.py      → analyze_node, chat_node, agent_node, summarize_node
  - router.py     → analyze_router, agent_router
  - tools_node.py → make_tools, _make_tool_node
--------------------------------------------------------------------------------
"""

import asyncio
import json
from typing import AsyncIterator

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph

from services.llm.response_filter import sanitize_response
from services.storage.checkpoint_store import get_saver

from .nodes import (
    analyze_node,
    summarize_node,
    _make_chat_node,
    _make_agent_node,
)
from .router import _make_agent_router, _make_analyze_router
from .state import AgentState
from .tools_node import make_tools, _make_tool_node


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== Graph 构建与缓存 ==========

_graph_cache: dict = {}


def _build_graph(
    user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""
):
    """构建并编译 StateGraph（含分析节点 + 自动摘要机制）。

    与标准 StateGraph 的区别：
      - 增加 analyze_node，一次 LLM 调用完成意图识别 + 查询改写
      - 增加 chat_node 处理纯闲聊（不走工具）
      - agent 节点使用滑动窗口，只传入近期消息到 LLM
      - 增加迭代保护（MAX_ITERATIONS），防止工具调用无限循环
    """
    # 1. 创建工具列表
    tools = make_tools(
        user_id=user_id, enable_knowledge=enable_knowledge, enable_search=enable_search
    )
    tool_names = [t.name for t in tools]
    print(
        f"[AGENT] 构建 Graph: user_id={user_id}, tools={tool_names}, "
        f"enable_knowledge={enable_knowledge}, enable_search={enable_search}"
    )

    # 2. 创建各节点（闭包捕获配置）
    analyze_router = _make_analyze_router()
    chat_node = _make_chat_node(system_prompt)
    agent_node = _make_agent_node(enable_knowledge, enable_search, system_prompt, tools)
    agent_router = _make_agent_router(tools)

    # 3. 构图
    builder = StateGraph(AgentState)

    # 3.1 入口节点：分析（意图识别 + 查询改写）
    builder.add_node("analyze", analyze_node)
    builder.set_entry_point("analyze")

    # 3.2 条件边：根据意图分流
    analyze_routing_map = {"chat": "chat", "agent": "agent"}
    builder.add_conditional_edges("analyze", analyze_router, analyze_routing_map)

    # 3.3 闲聊节点（不走工具）
    builder.add_node("chat", chat_node)
    builder.add_edge("chat", END)

    # 3.4 Agent 节点（带工具的 ReAct 循环）
    builder.add_node("agent", agent_node)

    # 3.5 工具节点（如果有工具）
    if tools:
        tool_node = _make_tool_node(tools)
        builder.add_node("tools", tool_node)
        builder.add_edge("tools", "agent")  # 工具执行完后回到 agent 继续思考

    # 3.6 摘要节点
    builder.add_node("summarize", summarize_node)
    builder.add_edge("summarize", END)  # 摘要完成后结束

    # 3.7 Agent 后的统一条件边
    routing_map = {"summarize": "summarize", END: END}
    if tools:
        routing_map["tools"] = "tools"

    builder.add_conditional_edges("agent", agent_router, routing_map)

    # 4. 编译，附加 checkpoint（对话记忆持久化）
    return builder.compile(checkpointer=get_saver())


def _get_graph(
    user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""
):
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
    initial_state = {
        "messages": [HumanMessage(content=content)],
        "iterations": 0,
    }

    # 4. LangGraph thread 配置
    config = {"configurable": {"thread_id": thread_id}}

    # 5. 遍历 Graph 输出
    has_content = False

    for msg, metadata in graph.stream(initial_state, config, stream_mode="messages"):
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

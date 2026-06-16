"""Agent 流式 SSE 输出 —— 主入口。

【架构说明：LangGraph StateGraph + 自动摘要机制 + 多意图路由】
--------------------------------------------------------------------------------
本文件是 Agent 的核心入口，职责单一：
  1. 组装 StateGraph（调用各子模块的节点/路由/工具工厂函数）
  2. 管理 Graph 实例缓存
  3. 对外暴露 stream_agent 流式接口

具体节点实现见：
  - state.py      → AgentState 定义
  - prompts.py    → 所有 system prompt 模板
  - nodes.py      → summarize_node, ensure_placeholder_node
  - supervisor/   → supervisor_node, supervisor_router
  - planner/      → planner_node, plan_executor, plan_executor_router
  - quality/      → quality_check_node, plan_refinement_node, quality_router, refinement_router
  - workers/      → chat_worker, direct_worker, knowledge_worker, search_worker, synthesis_worker
  - tools_node.py → make_tools, _make_tool_node
--------------------------------------------------------------------------------
"""

import asyncio
import json
from typing import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import RemoveMessage

from services.chat_attachments import build_human_message_content
from services.llm.response_filter import sanitize_response
from services.storage.checkpoint_store import get_async_saver

from .nodes import (
    ensure_placeholder_node,
    summarize_node,
)
from .workers import (
    _make_chat_worker,
    _make_direct_worker,
    _make_knowledge_worker,
    _make_search_worker,
    _make_synthesis_worker,
)
from .message_helpers import last_human_message, stamp_message_created_at
from .state import AgentState, MAX_RAW_MESSAGES
from .tools_node import make_tools, _make_tool_node

from .supervisor.node import supervisor_node
from .supervisor.router import supervisor_router
from .planner.node import planner_node
from .planner.executor import _make_plan_executor, plan_executor_router
from .quality.node import quality_check_node, plan_refinement_node, quality_router, refinement_router


# ========== 摘要条件路由 ==========


def _make_maybe_summarize_router():
    """创建 maybe_summarize 路由函数。

    检查消息数量是否超过 MAX_RAW_MESSAGES，超过则路由到 summarize 节点，否则直接 END。
    """

    def maybe_summarize_router(state: AgentState) -> str:
        msg_count = len(state.get("messages", []))
        if msg_count > MAX_RAW_MESSAGES:
            print(f"[AGENT] 路由 → summarize: 消息数 {msg_count} > 阈值 {MAX_RAW_MESSAGES}")
            return "summarize"
        return END

    return maybe_summarize_router


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== Graph 构建与缓存 ==========

_graph_cache: dict = {}


def _build_graph(
    user_id: str,
    enable_knowledge: bool,
    enable_search: bool,
    system_prompt: str = "",
    checkpointer=None,
):
    """构建并编译 StateGraph（含 supervisor 节点 + 自动摘要机制）。

    与标准 StateGraph 的区别：
      - 增加 supervisor_node，一次 LLM 调用完成多意图识别 + 复杂度评估
      - 增加 chat_worker 处理纯闲聊（不走工具）
      - 增加 direct_worker 处理单意图简单任务
      - 增加 planner_node + plan_executor 处理复杂/多意图任务
      - 增加 quality_check_node + plan_refinement_node 质量检查与计划重 refinement
      - 增加 synthesis_worker 综合结果生成最终回复
      - 保留 summarize_node 自动摘要机制
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
    chat_node = _make_chat_worker(system_prompt)
    direct_node = _make_direct_worker(system_prompt, tools, enable_knowledge, enable_search)
    plan_executor = _make_plan_executor(tools, system_prompt, enable_knowledge, enable_search)
    synthesis_node = _make_synthesis_worker(system_prompt)

    # 3. 构图
    builder = StateGraph(AgentState)

    # 3.1 入口节点：supervisor（多意图识别 + 复杂度评估）
    builder.add_node("supervisor", supervisor_node)
    builder.set_entry_point("supervisor")

    # 3.2 占位 AI（刷新列表可见「生成中」条）
    builder.add_node("ensure_placeholder", ensure_placeholder_node)
    builder.add_edge("supervisor", "ensure_placeholder")

    # 3.3 条件边：根据 supervisor 分析结果分流
    supervisor_routing_map = {
        "chat_worker": "chat_worker",
        "direct_worker": "direct_worker",
        "planner_node": "planner_node",
    }
    builder.add_conditional_edges(
        "ensure_placeholder", supervisor_router, supervisor_routing_map
    )

    # 3.4 闲聊节点（不走工具）
    builder.add_node("chat_worker", chat_node)

    # 3.5 直接执行节点（单意图简单任务）
    builder.add_node("direct_worker", direct_node)

    # 3.6 计划节点（生成执行计划）
    builder.add_node("planner_node", planner_node)

    # 3.7 计划执行节点（执行计划中的步骤）
    builder.add_node("plan_executor", plan_executor)

    # 3.8 综合节点（整合结果生成最终回复）
    builder.add_node("synthesis_worker", synthesis_node)

    # 3.9 质量检查节点
    builder.add_node("quality_check", quality_check_node)

    # 3.10 计划重 refinement 节点
    builder.add_node("plan_refinement", plan_refinement_node)

    # 3.11 摘要节点
    builder.add_node("summarize", summarize_node)

    # ========== 边连接 ==========

    # chat_worker / direct_worker → maybe_summarize_router
    builder.add_conditional_edges(
        "chat_worker",
        _make_maybe_summarize_router(),
        {"summarize": "summarize", END: END},
    )
    builder.add_conditional_edges(
        "direct_worker",
        _make_maybe_summarize_router(),
        {"summarize": "summarize", END: END},
    )

    # planner_node → plan_executor
    builder.add_edge("planner_node", "plan_executor")

    # plan_executor → plan_executor_router
    plan_executor_routing_map = {
        "plan_executor": "plan_executor",
        "synthesis_worker": "synthesis_worker",
    }
    builder.add_conditional_edges(
        "plan_executor", plan_executor_router, plan_executor_routing_map
    )

    # synthesis_worker → quality_check
    builder.add_edge("synthesis_worker", "quality_check")

    # quality_check → quality_router (注意：quality_router 返回 END 时进入 maybe_summarize)
    quality_routing_map = {
        END: "maybe_summarize_after_quality",
        "plan_refinement": "plan_refinement",
    }
    builder.add_conditional_edges(
        "quality_check", quality_router, quality_routing_map
    )

    # 质量检查通过后 → maybe_summarize_router
    builder.add_node("maybe_summarize_after_quality", lambda state: {})
    builder.add_conditional_edges(
        "maybe_summarize_after_quality",
        _make_maybe_summarize_router(),
        {"summarize": "summarize", END: END},
    )

    # plan_refinement → refinement_router
    refinement_routing_map = {
        "plan_executor": "plan_executor",
        END: END,
    }
    builder.add_conditional_edges(
        "plan_refinement", refinement_router, refinement_routing_map
    )

    # summarize → END
    builder.add_edge("summarize", END)

    # 4. 编译，附加 checkpoint（对话记忆持久化）
    if checkpointer is None:
        raise ValueError("checkpointer is required")
    return builder.compile(checkpointer=checkpointer)


async def get_graph(
    user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""
):
    """获取或编译 Graph 实例（按参数缓存；使用 AsyncPostgresSaver 供 astream 使用）。"""
    key = (user_id, enable_knowledge, enable_search, system_prompt)
    if key not in _graph_cache:
        print(f"[AGENT] 创建新 Graph: key={key}")
        saver = await get_async_saver()
        _graph_cache[key] = _build_graph(
            user_id=user_id,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
            system_prompt=system_prompt,
            checkpointer=saver,
        )
    else:
        print(f"[AGENT] 命中缓存 Graph: key={key}")
    return _graph_cache[key]


# 兼容旧调用
_get_graph = get_graph


# ========== 流式遍历 Graph ==========


async def persist_human_turn(
    graph,
    config: dict,
    human_message: HumanMessage,
    *,
    with_placeholder: bool = False,
) -> None:
    """将用户消息写入 checkpoint；可选同时写入占位 AI（单次 update，避免 Ambiguous update）。"""
    payload: list = [stamp_message_created_at(human_message)]
    if with_placeholder:
        payload.append(stamp_message_created_at(AIMessage(content="")))
    await graph.aupdate_state(
        config,
        {"messages": payload, "iterations": 0},
        as_node="__start__",
    )


async def _stream_graph_messages(
    graph,
    config: dict,
    graph_input,
    *,
    content_prefix: str = "",
) -> AsyncIterator[str]:
    """遍历 astream(messages)，输出 SSE 行；content 按增量片段下发。"""
    has_content = bool(content_prefix.strip())
    emitted_text = content_prefix

    if content_prefix.strip():
        yield _sse_json({"content": sanitize_response(content_prefix)})

    async for chunk in graph.astream(graph_input, config, stream_mode="messages"):
        if isinstance(chunk, tuple) and len(chunk) >= 2:
            msg, _metadata = chunk[0], chunk[1]
        else:
            msg = chunk

        msg_type = getattr(msg, "type", "")
        tool_calls = getattr(msg, "tool_calls", None)

        if msg_type == "tool":
            continue

        if tool_calls and any(tc.get("name") for tc in tool_calls if tc):
            continue

        token = getattr(msg, "content", "")
        if not token:
            continue

        piece = sanitize_response(str(token))
        if not piece:
            continue

        # messages 模式下可能是增量 token，也可能是累积全文
        if emitted_text and piece.startswith(emitted_text) and len(piece) > len(emitted_text):
            delta = piece[len(emitted_text) :]
            emitted_text = piece
        else:
            delta = piece
            emitted_text += piece

        if delta:
            has_content = True
            yield _sse_json({"content": delta})
            await asyncio.sleep(0.01)

    if not has_content:
        yield _sse_json({"content": "抱歉，我暂时无法回答这个问题，请稍后重试。"})

    yield _sse_json({"done": True})


# ========== 主函数：流式 SSE 输出 ==========


def build_user_human_message(
    message: str,
    *,
    attachments_list: list | None = None,
    text_supplements: list[tuple[str, str]] | None = None,
) -> HumanMessage:
    """构造当前轮用户 HumanMessage（含附件多模态）。"""
    content = build_human_message_content(
        message=message,
        attachments_list=attachments_list,
        text_supplements=text_supplements,
    )
    return HumanMessage(content=content)


async def prepare_turn(
    *,
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    attachments_list: list | None = None,
    text_supplements: list[tuple[str, str]] | None = None,
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> None:
    """流式开始前写入用户消息 + 占位 AI（analyze 仍读最后一条 human）。"""
    graph = await _get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )
    config = {"configurable": {"thread_id": thread_id}}
    human_message = build_user_human_message(
        message,
        attachments_list=attachments_list,
        text_supplements=text_supplements,
    )
    await persist_human_turn(graph, config, human_message, with_placeholder=True)


async def patch_last_human_message(
    *,
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    attachments_list: list | None = None,
    text_supplements: list[tuple[str, str]] | None = None,
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> None:
    """补全末条用户消息（如 txt 附件正文），保留原 created_at。"""
    graph = await _get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )
    config = {"configurable": {"thread_id": thread_id}}
    state = await graph.aget_state(config)
    messages = state.values.get("messages", []) if state else []
    last_human = last_human_message(messages)
    if not last_human or not getattr(last_human, "id", None):
        return

    new_human = build_user_human_message(
        message,
        attachments_list=attachments_list,
        text_supplements=text_supplements,
    )
    prev_kwargs = dict(getattr(last_human, "additional_kwargs", None) or {})
    if prev_kwargs.get("created_at"):
        new_kwargs = dict(getattr(new_human, "additional_kwargs", None) or {})
        new_kwargs["created_at"] = prev_kwargs["created_at"]
        new_human = new_human.model_copy(update={"additional_kwargs": new_kwargs})
    else:
        new_human = stamp_message_created_at(new_human)

    await graph.aupdate_state(
        config,
        {"messages": [RemoveMessage(id=last_human.id), new_human]},
        as_node="__start__",
    )


async def prepare_human_turn(
    *,
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    attachments_list: list | None = None,
    text_supplements: list[tuple[str, str]] | None = None,
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> None:
    """兼容旧调用：等同 prepare_turn。"""
    await prepare_turn(
        message=message,
        thread_id=thread_id,
        user_id=user_id,
        memory_context=memory_context,
        attachments_list=attachments_list,
        text_supplements=text_supplements,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
    )


async def stream_agent(
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    调用前须先 `prepare_human_turn` 写入用户消息；本函数从 checkpoint 继续执行图。
    短期记忆由 LangGraph checkpoint 自动管理，超出阈值时自动触发摘要。
    """
    print(
        f"[AGENT] stream_agent 参数: enable_knowledge={enable_knowledge}, "
        f"enable_search={enable_search}, user_id={user_id}"
    )

    graph = await _get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )
    config = {"configurable": {"thread_id": thread_id}}

    async for event in _stream_graph_messages(graph, config, None):
        yield event


async def stream_agent_resume(
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    enable_knowledge: bool = False,
    enable_search: bool = False,
    existing_prefix: str = "",
    *,
    turn_complete: bool = False,
) -> AsyncIterator[str]:
    """从 Checkpoint 恢复流式输出（不追加新的用户消息）。"""
    print(
        f"[AGENT] stream_agent_resume: user_id={user_id}, "
        f"turn_complete={turn_complete}, prefix_len={len(existing_prefix)}"
    )

    graph = await _get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )
    config = {"configurable": {"thread_id": thread_id}}

    if turn_complete and existing_prefix.strip():
        yield _sse_json({"content": sanitize_response(existing_prefix)})
        yield _sse_json({"done": True})
        return

    # None 表示从 checkpoint 继续执行，不注入新 HumanMessage
    async for event in _stream_graph_messages(
        graph,
        config,
        None,
        content_prefix=existing_prefix,
    ):
        yield event

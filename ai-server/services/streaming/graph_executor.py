"""Graph 后台执行器：在独立 asyncio.Task 中运行 LangGraph，token 写入 StreamBuffer。"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from services.agent_graph.core import get_graph
from services.llm.response_filter import sanitize_response
from .stream_buffer import create_buffer, get_buffer, schedule_buffer_cleanup

if TYPE_CHECKING:
    from services.streaming.stream_buffer import StreamBuffer


# ========== 全局任务管理 ==========

_graph_tasks: dict[str, asyncio.Task] = {}


def get_graph_task(thread_id: str) -> asyncio.Task | None:
    """获取指定 thread_id 正在运行的后台 Graph 任务。"""
    task = _graph_tasks.get(thread_id)
    if task is None or task.done():
        return None
    return task


def _register_task(thread_id: str, task: asyncio.Task) -> None:
    """注册任务，并在任务结束时自动清理。"""
    _graph_tasks[thread_id] = task

    def _on_done(t: asyncio.Task) -> None:
        _graph_tasks.pop(thread_id, None)

    task.add_done_callback(_on_done)


async def cancel_graph_task(thread_id: str) -> None:
    """取消指定 thread_id 的正在运行的 Graph 任务。"""
    task = _graph_tasks.pop(thread_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def clear_all_graph_tasks() -> None:
    """取消所有后台 Graph 任务（用于 shutdown）。"""
    for task in list(_graph_tasks.values()):
        if not task.done():
            task.cancel()
    _graph_tasks.clear()


# ========== 后台 Graph 执行 ==========


def _extract_delta_from_chunk(chunk, emitted_text: str) -> tuple[str, str]:
    """从 LangGraph stream_mode='messages' 的 chunk 中提取可见 token delta。

    返回 (delta, next_emitted_text)。如果无可提取内容，delta 为空字符串。
    """
    # 解包
    if isinstance(chunk, tuple) and len(chunk) >= 2:
        msg = chunk[0]
    else:
        msg = chunk

    msg_type = getattr(msg, "type", "")
    tool_calls = getattr(msg, "tool_calls", None)

    # 跳过 tool 消息和工具调用声明
    if msg_type == "tool":
        return "", emitted_text
    if tool_calls and any(tc.get("name") for tc in tool_calls if tc):
        return "", emitted_text

    token = getattr(msg, "content", "")
    if not token:
        return "", emitted_text

    piece = sanitize_response(str(token))
    if not piece:
        return "", emitted_text

    # Delta 检测：messages 模式下可能是增量 token，也可能是累积全文
    if emitted_text and piece.startswith(emitted_text) and len(piece) > len(emitted_text):
        delta = piece[len(emitted_text):]
        next_emitted = piece
    else:
        delta = piece
        next_emitted = emitted_text + piece

    return delta, next_emitted


async def run_graph_background(
    *,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    enable_knowledge: bool = False,
    enable_search: bool = False,
) -> str:
    """在后台运行 Graph，token 实时写入 StreamBuffer。

    返回最终生成的完整文本（用于上层持久化）。
    """
    buffer = get_buffer(thread_id)
    if buffer is None:
        buffer = create_buffer(thread_id)

    graph = await get_graph(
        user_id=user_id,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
        system_prompt=memory_context,
    )
    config = {"configurable": {"thread_id": thread_id}}

    full_response = ""
    try:
        async for chunk in graph.astream(None, config, stream_mode="messages"):
            delta, full_response = _extract_delta_from_chunk(chunk, full_response)
            if delta:
                await buffer.append(delta)
                # 小睡一下避免单条消息 token 过多时阻塞事件循环
                await asyncio.sleep(0)

        await buffer.finish()
    except asyncio.CancelledError:
        # 任务被取消（例如用户发送了新消息），标记为 error 以便前端感知
        await buffer.finish(error="cancelled")
        raise
    except Exception as e:
        error_msg = str(e) or repr(e) or type(e).__name__
        print(f"[graph_executor] 后台 Graph 执行异常: {error_msg}", flush=True)
        await buffer.finish(error=error_msg)
    finally:
        # Graph 完成后，延迟清理 Buffer
        await schedule_buffer_cleanup(thread_id)

    return full_response


async def start_graph_task(
    *,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    enable_knowledge: bool = False,
    enable_search: bool = False,
) -> asyncio.Task:
    """启动指定 thread_id 的后台 Graph 任务（若已有运行中任务，先取消）。"""
    existing = get_graph_task(thread_id)
    if existing is not None:
        await cancel_graph_task(thread_id)

    task = asyncio.create_task(
        run_graph_background(
            thread_id=thread_id,
            user_id=user_id,
            memory_context=memory_context,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
        ),
        name=f"graph-{thread_id}",
    )
    _register_task(thread_id, task)
    return task

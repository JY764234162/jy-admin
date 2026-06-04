"""断线 / 刷新后恢复 SSE 流。"""

import asyncio

from fastapi import HTTPException
from starlette.responses import StreamingResponse

from models.conversation import Conversation
from services.chat_resume import analyze_thread_for_resume
from services.streaming.graph_executor import get_graph_task
from services.streaming.stream_buffer import get_buffer

from .sse import sse_json, stream_from_buffer


def _sse_response(buffer, conversation_id: int) -> StreamingResponse:
    return StreamingResponse(
        stream_from_buffer(buffer),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(conversation_id)},
    )


async def build_resume_response(
    *,
    session_key: str,
    conversation_id: int,
    conv: Conversation,
) -> StreamingResponse:
    """Graph 运行中订阅 Buffer；已结束则从 Checkpoint 回放。"""
    buffer = get_buffer(session_key)
    if buffer is not None and buffer.status == "running":
        return _sse_response(buffer, conversation_id)

    task = get_graph_task(session_key)
    if task is not None and not task.done():
        for _ in range(20):
            await asyncio.sleep(0.05)
            buffer = get_buffer(session_key)
            if buffer:
                return _sse_response(buffer, conversation_id)
        raise HTTPException(503, "Graph 正在初始化，请稍后重试")

    ctx = await asyncio.to_thread(
        analyze_thread_for_resume, session_key, conv.latest_status
    )
    prefix = ctx.get("existing_assistant_prefix") or ""
    if not prefix:
        raise HTTPException(400, "当前会话没有可恢复的生成内容")

    async def replay_generator():
        yield sse_json({"content": prefix})
        yield sse_json({"done": True})

    return StreamingResponse(
        replay_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(conversation_id)},
    )

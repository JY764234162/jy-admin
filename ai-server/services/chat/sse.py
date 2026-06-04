"""Chat SSE 工具。"""

import json
from typing import AsyncIterator


def sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_from_buffer(buffer) -> AsyncIterator[str]:
    """从 StreamBuffer 订阅事件并生成 SSE data: 行。"""
    q = await buffer.subscribe()
    try:
        while True:
            event = await q.get()
            event_type = event.get("type")

            if event_type == "full":
                yield sse_json({"content": event["content"], "isFull": True})
            elif event_type == "delta":
                yield sse_json({"content": event["content"]})
            elif event_type == "done":
                error = event.get("error")
                if error:
                    yield sse_json({"content": "", "done": True, "error": error})
                else:
                    yield sse_json({"done": True})
                break
    finally:
        await buffer.unsubscribe(q)

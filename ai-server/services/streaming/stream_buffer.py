"""流式缓冲区：每个 thread_id 一个，支持多订阅者 SSE 读取。"""

from __future__ import annotations

import asyncio
from typing import Literal


class StreamBuffer:
    """管理单条 Graph 执行产生的 token 流，支持多 SSE 连接并发订阅。"""

    def __init__(self, thread_id: str) -> None:
        self.thread_id = thread_id
        self.full_text: str = ""
        self.status: Literal["running", "done", "error"] = "running"
        self.error: str | None = None
        self._subscribers: set[asyncio.Queue[dict]] = set()
        self._lock = asyncio.Lock()

    async def append(self, text: str) -> None:
        """追加 token 并广播给所有订阅者。"""
        if not text:
            return
        async with self._lock:
            self.full_text += text
            # 复制集合避免迭代时修改（虽然 discard 在锁内，但协程切换时安全）
            for q in list(self._subscribers):
                try:
                    q.put_nowait({"type": "delta", "content": text})
                except asyncio.QueueFull:
                    pass

    async def finish(self, error: str | None = None) -> None:
        """标记 Graph 执行结束（成功或失败），广播给所有订阅者。"""
        async with self._lock:
            self.status = "error" if error else "done"
            self.error = error
            for q in list(self._subscribers):
                try:
                    q.put_nowait({"type": "done", "error": error})
                except asyncio.QueueFull:
                    pass

    async def subscribe(self) -> asyncio.Queue[dict]:
        """新建订阅队列。先推送当前已有的全文，再进入 delta 订阅模式。"""
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=256)
        async with self._lock:
            # 1. 先发送已有全文（让新连接立即看到当前进度）
            if self.full_text:
                try:
                    q.put_nowait({"type": "full", "content": self.full_text})
                except asyncio.QueueFull:
                    pass

            # 2. 如果已经 done/error，立即发送结束事件（不加入 subscribers，避免死等）
            if self.status != "running":
                try:
                    q.put_nowait({"type": "done", "error": self.error})
                except asyncio.QueueFull:
                    pass
                return q

            self._subscribers.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        """移除订阅队列。"""
        async with self._lock:
            self._subscribers.discard(q)


# ========== 全局 Buffer 管理 ==========

_buffers: dict[str, StreamBuffer] = {}
_cleanup_tasks: dict[str, asyncio.Task] = {}

BUFFER_TTL_SECONDS = 300  # Graph 完成后 Buffer 保留 5 分钟


def get_buffer(thread_id: str) -> StreamBuffer | None:
    """获取指定 thread_id 的 StreamBuffer（若不存在返回 None）。"""
    return _buffers.get(thread_id)


def create_buffer(thread_id: str) -> StreamBuffer:
    """创建新的 StreamBuffer（若已存在则返回已有实例）。"""
    if thread_id in _buffers:
        return _buffers[thread_id]
    buf = StreamBuffer(thread_id)
    _buffers[thread_id] = buf
    return buf


def remove_buffer(thread_id: str) -> None:
    """立即移除 Buffer（通常由延迟清理任务调用）。"""
    _buffers.pop(thread_id, None)
    _cleanup_tasks.pop(thread_id, None)


async def schedule_buffer_cleanup(thread_id: str, delay: int = BUFFER_TTL_SECONDS) -> None:
    """Graph 完成后延迟清理 Buffer。"""
    # 取消旧的清理任务（如果存在）
    old = _cleanup_tasks.pop(thread_id, None)
    if old and not old.done():
        old.cancel()

    async def _delayed_cleanup() -> None:
        await asyncio.sleep(delay)
        remove_buffer(thread_id)

    _cleanup_tasks[thread_id] = asyncio.create_task(_delayed_cleanup())


def clear_all_buffers() -> None:
    """清理所有 Buffer 和待执行的清理任务（用于 shutdown）。"""
    for task in _cleanup_tasks.values():
        if not task.done():
            task.cancel()
    _cleanup_tasks.clear()
    _buffers.clear()

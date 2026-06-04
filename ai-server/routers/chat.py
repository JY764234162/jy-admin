import asyncio
import json
import traceback
import uuid
from functools import partial
from typing import AsyncIterator, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.storage.long_term_memory import get_memory
from services.agent_graph import prepare_turn
from services.chat_resume import analyze_thread_for_resume
from services.streaming.graph_executor import get_graph_task, run_graph_background
from services.streaming.stream_buffer import get_buffer
from services.chat_attachments import (
    build_attachment_memory_context,
    fetch_text_attachment,
)
from services.middleware import get_current_user, UserContext
from models.conversation import Conversation, SessionLocal

router = APIRouter(prefix="/api/ai/chat", tags=["chat"])

# ========== 长期记忆全局实例（PostgresStore）==========
semantic_memory = get_memory(top_k=5)


# ========== 请求模型 ==========


class ChatRequest(BaseModel):
    message: str = ""
    conversationId: Optional[int] = None
    attachments: Optional[str] = "[]"  # JSON 字符串，附件信息
    enable_knowledge: Optional[bool] = False  # 是否启用知识库工具
    enable_search: Optional[bool] = False  # 是否启用联网搜索工具


class ResumeRequest(BaseModel):
    conversationId: int
    enable_knowledge: Optional[bool] = False
    enable_search: Optional[bool] = False


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 数据库持久化辅助函数 ==========


def _get_conversation(conv_id: int, user_id: str) -> Conversation | None:
    """在独立 DB 会话中查询会话（供线程池调用，避免阻塞事件循环）。"""
    db = SessionLocal()
    try:
        return (
            db.query(Conversation)
            .filter(Conversation.id == conv_id, Conversation.user_id == user_id)
            .first()
        )
    finally:
        db.close()


def _prepare_memory_and_attachments(
    user_message: str, user_id: str, attachments_json: str
) -> tuple[str, list, list[tuple[str, str]]]:
    """长期记忆检索 + 附件解析（含同步 HTTP 拉取 txt）。"""
    memory_context = semantic_memory.format_memory_context(
        query=user_message, user_id=user_id
    )
    attachments_list: list = []
    text_supplements: list[tuple[str, str]] = []
    try:
        attachments_list = json.loads(attachments_json or "[]")
        if not isinstance(attachments_list, list):
            attachments_list = []
        memory_context = build_attachment_memory_context(
            attachments_list, memory_context
        )
        for att in attachments_list:
            if att.get("file_type") == ".txt" and att.get("url"):
                body = fetch_text_attachment(att["url"])
                if body:
                    text_supplements.append(
                        (att.get("filename", "file.txt"), body)
                    )
    except Exception as e:
        print(f"[chat] 解析附件失败: {e}")
        attachments_list = []
    return memory_context, attachments_list, text_supplements


def _on_user_message_received(
    conv_id: int, user_msg: str, attachments: str = "[]"
) -> None:
    """用户发问后立即更新会话元数据（与 checkpoint 同步，便于列表展示最新一问）。"""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            last = user_msg[:100] if len(user_msg) > 100 else user_msg
            conv.last_msg = last
            conv.latest_status = "loading"
            conv.latest_attachments = attachments
            db.commit()
    except Exception as e:
        print(f"[chat] 记录用户消息失败: {e}")
    finally:
        db.close()


def _persist_chat_result(
    conv_id: int,
    content: str,
    status: str,
    user_msg: str,
    attachments: str = "[]",
    *,
    increment_count: bool = True,
    last_msg_override: str | None = None,
):
    """更新会话元数据（不再写入 messages 表，消息由 Checkpoint 管理）。"""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            last = last_msg_override or user_msg
            last = last[:100] if len(last) > 100 else last
            conv.last_msg = last
            if increment_count:
                conv.message_count += 2
            conv.latest_status = status
            conv.latest_attachments = attachments
            db.commit()
    except Exception as e:
        print(f"[chat] 持久化失败: {e}")
    finally:
        db.close()


async def _stream_from_buffer(buffer) -> AsyncIterator[str]:
    """从 StreamBuffer 订阅事件并生成 SSE data: 行。

    事件格式：
      - full: {"content": "...", "isFull": true}  — 一次性推送已有全文
      - delta: {"content": "..."}                  — 增量 token
      - done: {"done": true} 或 {"done": true, "error": "..."}
    """
    q = await buffer.subscribe()
    try:
        while True:
            event = await q.get()
            event_type = event.get("type")
            if event_type == "full":
                yield _sse_json({"content": event["content"], "isFull": True})
            elif event_type == "delta":
                yield _sse_json({"content": event["content"]})
            elif event_type == "done":
                error = event.get("error")
                if error:
                    yield _sse_json({"content": "", "done": True, "error": error})
                else:
                    yield _sse_json({"done": True})
                break
    finally:
        await buffer.unsubscribe(q)


async def _chat_background(
    *,
    thread_id: str,
    user_id: str,
    user_message: str,
    memory_context: str,
    attachments_json: str,
    enable_knowledge: bool,
    enable_search: bool,
    conv_db_id: int | None,
    conversation_id,
) -> None:
    """后台执行 Graph 并在完成后持久化结果（与 SSE 推流生命周期解耦）。"""
    full_response = ""
    error_msg = None

    try:
        full_response = await run_graph_background(
            thread_id=thread_id,
            user_id=user_id,
            memory_context=memory_context,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
        )

        if full_response.strip() and user_message.strip():
            await asyncio.to_thread(
                semantic_memory.save_interaction,
                user_message,
                full_response,
                str(conversation_id),
                str(user_id),
            )
    except asyncio.CancelledError:
        # 正常取消（用户发送新消息等），尝试保留已生成内容
        buf = get_buffer(thread_id)
        if buf:
            full_response = buf.full_text
        raise
    except Exception as e:
        error_msg = str(e) or repr(e) or type(e).__name__
        print(f"[chat] 后台 Graph 执行异常: {error_msg}", flush=True)
        traceback.print_exc()
        buf = get_buffer(thread_id)
        if buf:
            full_response = buf.full_text
    finally:
        if conv_db_id:
            status = "error" if error_msg else "success"
            last_display = (full_response or user_message)[:100]
            await asyncio.to_thread(
                partial(
                    _persist_chat_result,
                    conv_db_id,
                    full_response,
                    status,
                    user_message,
                    attachments_json,
                    increment_count=True,
                    last_msg_override=last_display,
                )
            )


@router.post("")
async def chat_message(
    req: ChatRequest,
    user: UserContext = Depends(get_current_user),
):
    user_message = req.message.strip()
    if not user_message:
        raise HTTPException(400, "消息不能为空")

    user_id = user.id if user else ""
    if not user_id:
        raise HTTPException(401, "未登录")

    conversation_id = req.conversationId or uuid.uuid4().hex[:16]

    # 验证会话、记忆检索、附件拉取：同步 I/O 放入线程池，避免阻塞其他 API
    conv = None
    if req.conversationId:
        conv = await asyncio.to_thread(
            _get_conversation, conversation_id, user_id
        )

    if req.conversationId and not conv:
        raise HTTPException(404, "会话不存在或无权限")

    conv_db_id = conv.id if conv else None

    memory_context, attachments_list, text_supplements = await asyncio.to_thread(
        _prepare_memory_and_attachments,
        user_message,
        str(user_id),
        req.attachments or "[]",
    )

    # thread_id 用于 Checkpoint
    session_key = f"{user_id}:{conversation_id}" if user_id else conversation_id

    # 是否启用知识库工具（前端勾选知识库）
    enable_knowledge = (
        req.enable_knowledge if req.enable_knowledge is not None else False
    )
    # 是否启用联网搜索工具（前端勾选联网搜索）
    enable_search = req.enable_search if req.enable_search is not None else False

    await prepare_turn(
        message=user_message,
        thread_id=session_key,
        user_id=str(user_id),
        memory_context=memory_context,
        attachments_list=attachments_list,
        text_supplements=text_supplements,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
    )

    if conv_db_id:
        await asyncio.to_thread(
            _on_user_message_received,
            conv_db_id,
            user_message,
            req.attachments or "[]",
        )

    # 启动后台 Graph 任务（与 SSE 推流生命周期解耦）
    asyncio.create_task(
        _chat_background(
            thread_id=session_key,
            user_id=str(user_id),
            user_message=user_message,
            memory_context=memory_context,
            attachments_json=req.attachments or "[]",
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
            conv_db_id=conv_db_id,
            conversation_id=conversation_id,
        )
    )

    # 获取 Buffer（后台任务启动后会立即创建）
    buffer = get_buffer(session_key)
    if buffer is None:
        # 极少数情况下后台任务启动失败，fallback 等待
        for _ in range(10):
            await asyncio.sleep(0.05)
            buffer = get_buffer(session_key)
            if buffer:
                break
        if buffer is None:
            raise HTTPException(500, "启动流式生成失败")

    return StreamingResponse(
        _stream_from_buffer(buffer),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(conversation_id)},
    )


@router.post("/resume")
async def chat_resume(
    req: ResumeRequest,
    user: UserContext = Depends(get_current_user),
):
    """刷新/断线后恢复流式输出：重新连接 StreamBuffer 或从 Checkpoint 回放。"""
    user_id = user.id if user else ""
    if not user_id:
        raise HTTPException(401, "未登录")

    conv = await asyncio.to_thread(_get_conversation, req.conversationId, user_id)
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    session_key = f"{user_id}:{req.conversationId}"

    # 1. Graph 还在后台运行：直接订阅 Buffer
    buffer = get_buffer(session_key)
    if buffer is not None:
        return StreamingResponse(
            _stream_from_buffer(buffer),
            media_type="text/event-stream",
            headers={"X-Conversation-Id": str(req.conversationId)},
        )

    # 2. Graph 正在执行但 Buffer 被清理了（极少见）
    task = get_graph_task(session_key)
    if task is not None and not task.done():
        # 等待 Buffer 创建
        for _ in range(20):
            await asyncio.sleep(0.05)
            buffer = get_buffer(session_key)
            if buffer:
                break
        if buffer:
            return StreamingResponse(
                _stream_from_buffer(buffer),
                media_type="text/event-stream",
                headers={"X-Conversation-Id": str(req.conversationId)},
            )
        raise HTTPException(503, "Graph 正在初始化，请稍后重试")

    # 3. Graph 已跑完 / 从未启动：从 Checkpoint 读取回放
    ctx = await asyncio.to_thread(
        analyze_thread_for_resume, session_key, conv.latest_status
    )
    prefix = ctx.get("existing_assistant_prefix") or ""
    if not prefix:
        raise HTTPException(400, "当前会话没有可恢复的生成内容")

    async def replay_generator():
        yield _sse_json({"content": prefix})
        yield _sse_json({"done": True})

    return StreamingResponse(
        replay_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(req.conversationId)},
    )

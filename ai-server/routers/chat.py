import asyncio
import json
import traceback
import uuid
from functools import partial
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.storage.long_term_memory import get_memory
from services.agent_graph import prepare_human_turn, stream_agent, stream_agent_resume
from services.chat_resume import analyze_thread_for_resume
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


def _set_conversation_status(conv_id: int, status: str) -> None:
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            conv.latest_status = status
            db.commit()
    except Exception as e:
        print(f"[chat] 更新状态失败: {e}")
    finally:
        db.close()


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


async def _run_chat_sse(
    *,
    conv_db_id: int | None,
    conversation_id,
    user_id: str,
    user_message: str,
    attachments_json: str,
    event_stream,
    increment_count: bool = True,
    record_user_received: bool = True,
):
    """统一 SSE 生成：累积全文、记忆写入、会话状态持久化。"""
    if conv_db_id and not record_user_received:
        await asyncio.to_thread(_set_conversation_status, conv_db_id, "loading")

    full_response = ""
    error_msg = None

    try:
        async for event in event_stream:
            data_str = event.removeprefix("data: ").strip()
            try:
                data = json.loads(data_str)
                chunk = data.get("content")
                if chunk:
                    full_response += str(chunk)
            except Exception:
                pass
            yield event

        if full_response.strip() and user_message.strip():
            await asyncio.to_thread(
                semantic_memory.save_interaction,
                user_message,
                full_response,
                str(conversation_id),
                str(user_id),
            )
    except Exception as e:
        error_msg = str(e) or repr(e) or type(e).__name__
        print(f"[chat] 流式生成异常: {error_msg}", flush=True)
        traceback.print_exc()
        yield _sse_json({"content": "", "done": True, "error": error_msg})
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
                    increment_count=increment_count,
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

    await prepare_human_turn(
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

    async def event_generator():
        async for event in _run_chat_sse(
            conv_db_id=conv_db_id,
            conversation_id=conversation_id,
            user_id=str(user_id),
            user_message=user_message,
            attachments_json=req.attachments or "[]",
            event_stream=stream_agent(
                thread_id=session_key,
                user_id=str(user_id),
                memory_context=memory_context,
                enable_knowledge=enable_knowledge,
                enable_search=enable_search,
            ),
            increment_count=True,
            record_user_received=False,
        ):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(conversation_id)},
    )


@router.post("/resume")
async def chat_resume(
    req: ResumeRequest,
    user: UserContext = Depends(get_current_user),
):
    """刷新/断线后恢复流式输出：从 Checkpoint 继续，不重复写入用户消息。"""
    user_id = user.id if user else ""
    if not user_id:
        raise HTTPException(401, "未登录")

    conv = await asyncio.to_thread(_get_conversation, req.conversationId, user_id)
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    session_key = f"{user_id}:{req.conversationId}"
    ctx = await asyncio.to_thread(
        analyze_thread_for_resume, session_key, conv.latest_status
    )

    if not ctx.get("can_resume") and not ctx.get("existing_assistant_prefix"):
        raise HTTPException(400, "当前会话没有可恢复的生成任务")

    last_user = ctx.get("last_user_message") or ""
    memory_context = ""
    if last_user:
        memory_context = await asyncio.to_thread(
            semantic_memory.format_memory_context, last_user, str(user_id)
        )

    enable_knowledge = (
        req.enable_knowledge if req.enable_knowledge is not None else False
    )
    enable_search = req.enable_search if req.enable_search is not None else False

    async def event_generator():
        async for event in _run_chat_sse(
            conv_db_id=conv.id,
            conversation_id=req.conversationId,
            user_id=str(user_id),
            user_message=last_user,
            attachments_json=conv.latest_attachments or "[]",
            event_stream=stream_agent_resume(
                thread_id=session_key,
                user_id=str(user_id),
                memory_context=memory_context,
                enable_knowledge=enable_knowledge,
                enable_search=enable_search,
                existing_prefix=ctx.get("existing_assistant_prefix") or "",
                turn_complete=bool(
                    ctx.get("turn_complete") and not ctx.get("needs_continue")
                ),
            ),
            increment_count=False,
            record_user_received=False,
        ):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(req.conversationId)},
    )

"""Chat 路由：发送消息与断线恢复。"""

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import StreamingResponse

from services.agent_graph import prepare_turn
from services.chat import (
    ChatRequest,
    ResumeRequest,
    build_resume_response,
    get_conversation,
    on_user_message_received,
    parse_attachments_list,
    run_chat_background,
    stream_from_buffer,
)
from services.middleware import get_current_user, UserContext
from services.streaming.stream_buffer import create_buffer, remove_buffer

router = APIRouter(prefix="/api/ai/chat", tags=["chat"])

# 跟踪每个 session_key 的活跃后台任务，便于发送新消息时取消旧任务
_active_chat_tasks: dict[str, asyncio.Task] = {}


def _cancel_old_task(session_key: str) -> None:
    """取消指定会话的旧后台任务（不等待），避免新旧任务竞争 Buffer。"""
    old_task = _active_chat_tasks.pop(session_key, None)
    if old_task is not None and not old_task.done():
        old_task.cancel()


def _register_task(session_key: str, task: asyncio.Task) -> None:
    """注册新任务，并在完成时自动清理。"""
    _active_chat_tasks[session_key] = task

    def _on_done(t: asyncio.Task) -> None:
        _active_chat_tasks.pop(session_key, None)

    task.add_done_callback(_on_done)


def _thread_id(user_id: str, conversation_id) -> str:
    return f"{user_id}:{conversation_id}" if user_id else str(conversation_id)


async def _persist_user_turn_early(
    *,
    user_message: str,
    session_key: str,
    user_id: str,
    conv_db_id: int | None,
    attachments_json: str,
    attachments_list: list,
    enable_knowledge: bool,
    enable_search: bool,
) -> None:
    """尽早写入 checkpoint + 会话元数据，便于发送后立即刷新 messagelist。"""
    await prepare_turn(
        message=user_message,
        thread_id=session_key,
        user_id=user_id,
        memory_context="",
        attachments_list=attachments_list,
        text_supplements=None,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
    )

    if conv_db_id:
        await asyncio.to_thread(
            on_user_message_received,
            conv_db_id,
            user_message,
            attachments_json,
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

    conv = None
    if req.conversationId:
        conv = await asyncio.to_thread(get_conversation, conversation_id, user_id)

    if req.conversationId and not conv:
        raise HTTPException(404, "会话不存在或无权限")

    attachments_json = req.attachments or "[]"
    attachments_list = parse_attachments_list(attachments_json)
    session_key = _thread_id(user_id, conversation_id)
    enable_knowledge = req.enable_knowledge if req.enable_knowledge is not None else False
    enable_search = req.enable_search if req.enable_search is not None else False

    await _persist_user_turn_early(
        user_message=user_message,
        session_key=session_key,
        user_id=str(user_id),
        conv_db_id=conv.id if conv else None,
        attachments_json=attachments_json,
        attachments_list=attachments_list,
        enable_knowledge=enable_knowledge,
        enable_search=enable_search,
    )

    # 清理旧任务和旧 Buffer，避免新请求返回缓存数据
    _cancel_old_task(session_key)
    remove_buffer(session_key)
    buffer = create_buffer(session_key)

    task = asyncio.create_task(
        run_chat_background(
            thread_id=session_key,
            user_id=str(user_id),
            user_message=user_message,
            attachments_json=attachments_json,
            attachments_list=attachments_list,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
            conv_db_id=conv.id if conv else None,
            conversation_id=conversation_id,
        )
    )
    _register_task(session_key, task)

    return StreamingResponse(
        stream_from_buffer(buffer),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": str(conversation_id)},
    )


@router.post("/resume")
async def chat_resume(
    req: ResumeRequest,
    user: UserContext = Depends(get_current_user),
):
    """刷新/断线后恢复流式输出。"""
    user_id = user.id if user else ""
    if not user_id:
        raise HTTPException(401, "未登录")

    conv = await asyncio.to_thread(get_conversation, req.conversationId, user_id)
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    session_key = _thread_id(user_id, req.conversationId)
    return await build_resume_response(
        session_key=session_key,
        conversation_id=req.conversationId,
        conv=conv,
    )

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.conversation import Conversation, get_db
from services.middleware import get_current_user, UserContext
from services.chat_attachments import content_to_display_text
from services.llm.response_filter import sanitize_response
from services.storage import (
    get_thread_messages,
    thread_exists,
    delete_thread,
)

router = APIRouter(prefix="/api/ai/conversation", tags=["conversation"])


# ========== 请求/响应模型 ==========

class CreateConversationRequest(BaseModel):
    title: str


class UpdateTitleRequest(BaseModel):
    title: str


class ConversationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    last_msg: str
    message_count: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class PageResult(BaseModel):
    list: list
    total: int
    page: int
    page_size: int


# ========== 辅助函数 ==========

def _conv_to_dict(c: Conversation) -> dict:
    return {
        "ID": c.id,
        "userId": c.user_id,
        "title": c.title,
        "lastMsg": c.last_msg,
        "message_count": c.message_count,
        "createdAt": c.created_at.isoformat() if c.created_at else "",
        "updatedAt": c.updated_at.isoformat() if c.updated_at else "",
    }


def _messages_from_checkpoint(conv_id: int, user_id: int, conv: Conversation) -> list[dict]:
    """从 Checkpoint 读取消息并转换为前端格式。"""
    thread_id = f"{user_id}:{conv_id}"
    raw_messages = get_thread_messages(thread_id)

    result = []
    for i, msg in enumerate(raw_messages):
        role = "assistant"
        if msg.type == "human":
            role = "user"
        elif msg.type == "assistant" or msg.type == "ai":
            # 跳过包含工具调用的 AI 消息（只保留最终回答）
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                continue
            role = "assistant"
        else:
            # system / tool 消息不展示在前端
            continue

        result.append({
            "ID": i + 1,
            "conversationId": conv_id,
            "role": role,
            "content": (
                sanitize_response(content_to_display_text(msg.content))
                if role == "assistant"
                else content_to_display_text(msg.content)
            ),
            "userId": user_id,
            "status": conv.latest_status,
            "attachments": conv.latest_attachments,
            "createdAt": "",
        })

    return result


# ========== API 端点 ==========

@router.post("")
async def create_conversation(
    req: CreateConversationRequest,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建新会话"""
    if not user:
        raise HTTPException(401, "未登录")

    conv = Conversation(user_id=user.id, title=req.title.strip())
    db.add(conv)
    db.commit()
    db.refresh(conv)

    return {"code": 0, "data": _conv_to_dict(conv), "msg": "创建成功"}


@router.get("/list")
async def get_conversation_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的会话列表（按更新时间倒序）"""
    if not user:
        raise HTTPException(401, "未登录")

    query = db.query(Conversation).filter(Conversation.user_id == user.id)
    total = query.count()

    conversations = (
        query.order_by(Conversation.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "code": 0,
        "data": {
            "list": [_conv_to_dict(c) for c in conversations],
            "total": total,
            "page": page,
            "pageSize": page_size,
        },
        "msg": "获取成功",
    }


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: int,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除会话及其 checkpoint 数据"""
    if not user:
        raise HTTPException(401, "未登录")

    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    db.delete(conv)
    db.commit()

    # 同时删除 checkpoint thread
    thread_id = f"{user.id}:{conv_id}"
    try:
        delete_thread(thread_id)
    except Exception as e:
        print(f"[conversation] 删除 checkpoint 失败: {e}")

    return {"code": 0, "msg": "删除成功"}


@router.put("/{conv_id}/title")
async def update_conversation_title(
    conv_id: int,
    req: UpdateTitleRequest,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新会话标题"""
    if not user:
        raise HTTPException(401, "未登录")

    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    new_title = req.title.strip()
    if not new_title:
        raise HTTPException(400, "标题不能为空")

    conv.title = new_title
    db.commit()

    return {"code": 0, "msg": "更新成功"}


@router.get("/{conv_id}/messages")
async def get_message_list(
    conv_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取会话消息列表（从 Checkpoint 读取）。"""
    if not user:
        raise HTTPException(401, "未登录")

    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")

    thread_id = f"{user.id}:{conv_id}"
    items = _messages_from_checkpoint(conv_id=conv_id, user_id=user.id, conv=conv)
    # 倒序（最新的在前），内存分页
    items.reverse()
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    return {
        "code": 0,
        "data": {
            "list": page_items,
            "total": total,
            "page": page,
            "pageSize": page_size,
        },
        "msg": "获取成功",
    }

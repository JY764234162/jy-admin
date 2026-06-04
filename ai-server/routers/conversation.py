"""Conversation 路由：会话 CRUD 与消息列表。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.conversation import Conversation, get_db
from services.chat_resume import analyze_thread_for_resume
from services.conversation import conv_to_dict, messages_from_checkpoint
from services.middleware import get_current_user, UserContext
from services.streaming.graph_executor import get_graph_task
from services.streaming.stream_buffer import get_buffer
from services.storage import delete_thread

router = APIRouter(prefix="/api/ai/conversation", tags=["conversation"])


class CreateConversationRequest(BaseModel):
    title: str


class UpdateTitleRequest(BaseModel):
    title: str


def _require_user(user: UserContext | None) -> UserContext:
    if not user:
        raise HTTPException(401, "未登录")
    return user


def _get_owned_conversation(
    db: Session, conv_id: int, user_id: str
) -> Conversation:
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == user_id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "会话不存在或无权限")
    return conv


def _sync_loading_status(db: Session, conv: Conversation, thread_id: str) -> None:
    """Graph 已结束但 DB 仍为 loading 时，修正 latest_status。"""
    if conv.latest_status != "loading":
        return
    if get_buffer(thread_id) is not None or get_graph_task(thread_id) is not None:
        return

    ctx = analyze_thread_for_resume(thread_id, conv.latest_status)
    if not ctx.get("needs_continue"):
        conv.latest_status = "success"
        db.commit()


@router.post("")
async def create_conversation(
    req: CreateConversationRequest,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _require_user(user)
    conv = Conversation(user_id=user.id, title=req.title.strip())
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"code": 0, "data": conv_to_dict(conv), "msg": "创建成功"}


@router.get("/list")
async def get_conversation_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _require_user(user)
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
            "list": [conv_to_dict(c) for c in conversations],
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
    user = _require_user(user)
    conv = _get_owned_conversation(db, conv_id, user.id)
    db.delete(conv)
    db.commit()

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
    user = _require_user(user)
    conv = _get_owned_conversation(db, conv_id, user.id)

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
    user = _require_user(user)
    conv = _get_owned_conversation(db, conv_id, user.id)

    thread_id = f"{user.id}:{conv_id}"
    _sync_loading_status(db, conv, thread_id)

    items = messages_from_checkpoint(conv_id=conv_id, user_id=user.id, conv=conv)
    items.reverse()

    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

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

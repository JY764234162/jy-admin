"""从 Checkpoint 构建消息列表。"""

from datetime import datetime, timedelta, timezone

from models.conversation import Conversation
from services.chat_attachments import content_to_display_text
from services.llm.response_filter import sanitize_response
from services.agent_graph.message_helpers import (
    is_placeholder_assistant,
    message_created_at_iso,
)
from services.storage import get_thread_messages

VisibleEntry = tuple[str, object]


def _collect_visible_messages(raw_messages) -> list[VisibleEntry]:
    """过滤 tool 消息，保留用户 / 助手 / 工具调用中的助手。"""
    visible: list[VisibleEntry] = []

    for msg in raw_messages:
        if msg.type == "human":
            visible.append(("user", msg))
            continue
        if msg.type not in ("assistant", "ai"):
            continue

        tool_calls = getattr(msg, "tool_calls", None)
        if tool_calls:
            visible.append(("assistant_pending", msg))
            continue

        if is_placeholder_assistant(msg) or content_to_display_text(msg.content).strip():
            visible.append(("assistant", msg))

    return visible


def _base_datetime(conv: Conversation) -> datetime:
    base_dt = conv.created_at or conv.updated_at or datetime.now(timezone.utc)
    if base_dt.tzinfo is None:
        base_dt = base_dt.replace(tzinfo=timezone.utc)
    return base_dt


def _message_status(
    *,
    role: str,
    is_last: bool,
    conv_status: str,
) -> str:
    if role == "user" or not is_last:
        return "success"
    if conv_status == "loading":
        return "loading"
    if conv_status == "error":
        return "error"
    return "success"


def _message_content(kind: str, role: str, msg) -> str:
    if kind == "assistant_pending":
        return "正在处理..."
    if role == "assistant":
        return sanitize_response(content_to_display_text(msg.content))
    return content_to_display_text(msg.content)


def messages_from_checkpoint(conv_id: int, user_id: int, conv: Conversation) -> list[dict]:
    """从 Checkpoint 读取消息；仅列表末条携带 loading/error。"""
    thread_id = f"{user_id}:{conv_id}"
    raw_messages = get_thread_messages(thread_id)
    conv_status = conv.latest_status or "success"
    visible = _collect_visible_messages(raw_messages)

    base_dt = _base_datetime(conv)
    last_idx = len(visible) - 1
    last_user_idx = next(
        (i for i, (kind, _) in reversed(list(enumerate(visible))) if kind == "user"),
        -1,
    )

    result: list[dict] = []
    for idx, (kind, msg) in enumerate(visible):
        is_last = idx == last_idx
        role = "user" if kind == "user" else "assistant"

        if kind == "assistant_pending" and not is_last:
            continue

        result.append(
            {
                "ID": idx + 1,
                "conversationId": conv_id,
                "role": role,
                "content": _message_content(kind, role, msg),
                "userId": user_id,
                "status": _message_status(
                    role=role, is_last=is_last, conv_status=conv_status
                ),
                "attachments": (
                    conv.latest_attachments
                    if role == "user" and idx == last_user_idx
                    else None
                ),
                "createdAt": message_created_at_iso(
                    msg,
                    fallback=base_dt + timedelta(seconds=idx),
                ),
            }
        )

    return result

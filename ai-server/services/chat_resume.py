"""聊天流式恢复：从 Checkpoint 判断是否需要续跑，并提取已有回复前缀。"""

from __future__ import annotations

from langchain_core.messages import BaseMessage

from services.chat_attachments import content_to_display_text
from services.storage.checkpoint_store import get_thread_messages


def _message_text(msg: BaseMessage) -> str:
    return content_to_display_text(getattr(msg, "content", ""))


def _is_visible_assistant(msg: BaseMessage) -> bool:
    if getattr(msg, "type", "") not in ("ai", "assistant"):
        return False
    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls and any(tc.get("name") for tc in tool_calls if tc):
        return False
    return bool(_message_text(msg).strip())


def analyze_thread_for_resume(thread_id: str, latest_status: str) -> dict:
    """分析会话线程是否可恢复，并返回续跑上下文。"""
    messages = get_thread_messages(thread_id)
    if not messages:
        return {
            "can_resume": False,
            "reason": "no_checkpoint",
            "last_user_message": "",
            "existing_assistant_prefix": "",
            "turn_complete": False,
        }

    last_user = ""
    last_assistant = ""
    for msg in messages:
        if getattr(msg, "type", "") == "human":
            last_user = _message_text(msg)
        elif _is_visible_assistant(msg):
            last_assistant = _message_text(msg)

    last_is_human = getattr(messages[-1], "type", "") == "human"
    turn_complete = bool(last_assistant) and not last_is_human
    needs_continue = latest_status == "loading" or last_is_human
    can_resume = bool(last_user) and (needs_continue or (turn_complete and latest_status == "loading"))

    return {
        "can_resume": can_resume,
        "reason": "ok" if can_resume else "already_complete",
        "last_user_message": last_user,
        "existing_assistant_prefix": last_assistant if not last_is_human else "",
        "turn_complete": turn_complete,
        "needs_continue": needs_continue and not turn_complete,
    }

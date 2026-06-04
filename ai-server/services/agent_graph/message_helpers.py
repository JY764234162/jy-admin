"""Agent 消息辅助：占位 AI、LLM 上下文裁剪、状态更新。"""

from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph.message import RemoveMessage

from services.chat_attachments import content_to_display_text


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp_message_created_at(msg: BaseMessage) -> BaseMessage:
    """写入消息时打上 created_at（存入 additional_kwargs，供列表接口展示）。"""
    kwargs = dict(getattr(msg, "additional_kwargs", None) or {})
    if not kwargs.get("created_at"):
        kwargs["created_at"] = _utc_now_iso()
    if hasattr(msg, "model_copy"):
        return msg.model_copy(update={"additional_kwargs": kwargs})
    msg.additional_kwargs = kwargs
    return msg


def message_created_at_iso(msg: BaseMessage, *, fallback: datetime | None = None) -> str:
    """读取消息创建时间；无记录时使用 fallback（历史消息兼容）。"""
    kwargs = getattr(msg, "additional_kwargs", None) or {}
    if isinstance(kwargs, dict):
        raw = kwargs.get("created_at") or kwargs.get("createdAt")
        if raw:
            return str(raw)
    if fallback is not None:
        dt = fallback
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return ""


def is_placeholder_assistant(msg: BaseMessage) -> bool:
    """末尾占位 AI：无正文、无工具调用。"""
    if getattr(msg, "type", "") not in ("ai", "assistant"):
        return False
    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls:
        return False
    return not content_to_display_text(getattr(msg, "content", "")).strip()


def last_human_message(messages: list[BaseMessage]) -> HumanMessage | None:
    for msg in reversed(messages):
        if getattr(msg, "type", "") == "human":
            return msg
    return None


def messages_for_llm_prompt(messages: list[BaseMessage], *, limit: int) -> list[BaseMessage]:
    """构建 LLM 输入时去掉末尾占位 AI，避免空回复干扰模型。"""
    recent = list(messages[-limit:])
    if recent and is_placeholder_assistant(recent[-1]):
        return recent[:-1]
    return recent


def build_assistant_reply_update(
    messages: list[BaseMessage], response: AIMessage
) -> dict:
    """写入助手回复：工具调用时移除占位条；最终正文替换末尾占位。"""
    response = stamp_message_created_at(response)
    tool_calls = getattr(response, "tool_calls", None)
    if tool_calls:
        updates: list = []
        for msg in reversed(messages):
            if is_placeholder_assistant(msg) and getattr(msg, "id", None):
                updates.append(RemoveMessage(id=msg.id))
                break
        updates.append(response)
        return {"messages": updates}

    if messages and is_placeholder_assistant(messages[-1]) and getattr(
        messages[-1], "id", None
    ):
        return {
            "messages": [RemoveMessage(id=messages[-1].id), response],
        }
    return {"messages": [response]}

"""Chat 会话元数据持久化。"""

from models.conversation import Conversation, SessionLocal


def get_conversation(conv_id: int, user_id: str) -> Conversation | None:
    """在独立 DB 会话中查询会话（供线程池调用）。"""
    db = SessionLocal()
    try:
        return (
            db.query(Conversation)
            .filter(Conversation.id == conv_id, Conversation.user_id == user_id)
            .first()
        )
    finally:
        db.close()


def on_user_message_received(
    conv_id: int, user_msg: str, attachments: str = "[]"
) -> None:
    """用户发问后立即更新会话元数据。"""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            conv.last_msg = user_msg[:100]
            conv.latest_status = "loading"
            conv.latest_attachments = attachments
            db.commit()
    except Exception as e:
        print(f"[chat] 记录用户消息失败: {e}")
    finally:
        db.close()


def persist_chat_result(
    conv_id: int,
    content: str,
    status: str,
    user_msg: str,
    attachments: str = "[]",
    *,
    increment_count: bool = True,
    last_msg_override: str | None = None,
) -> None:
    """Graph 完成后更新会话元数据。"""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            last = last_msg_override or user_msg
            conv.last_msg = last[:100]
            if increment_count:
                conv.message_count += 2
            conv.latest_status = status
            conv.latest_attachments = attachments
            db.commit()
    except Exception as e:
        print(f"[chat] 持久化失败: {e}")
    finally:
        db.close()

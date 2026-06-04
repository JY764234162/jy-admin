"""Conversation 序列化。"""

from models.conversation import Conversation


def conv_to_dict(c: Conversation) -> dict:
    return {
        "ID": c.id,
        "userId": c.user_id,
        "title": c.title,
        "lastMsg": c.last_msg,
        "message_count": c.message_count,
        "latestStatus": c.latest_status,
        "createdAt": c.created_at.isoformat() if c.created_at else "",
        "updatedAt": c.updated_at.isoformat() if c.updated_at else "",
    }

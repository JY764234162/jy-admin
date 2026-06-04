"""Chat 附件解析与记忆上下文准备。"""

import json

from services.chat_attachments import (
    build_attachment_memory_context,
    fetch_text_attachment,
)

from .memory import semantic_memory


def parse_attachments_list(attachments_json: str) -> list:
    """同步解析附件 JSON（不含 HTTP 拉取）。"""
    try:
        attachments_list = json.loads(attachments_json or "[]")
        if not isinstance(attachments_list, list):
            return []
        return attachments_list
    except Exception as e:
        print(f"[chat] 解析附件失败: {e}")
        return []


def prepare_memory_and_attachments(
    user_message: str, user_id: str, attachments_list: list
) -> tuple[str, list[tuple[str, str]]]:
    """长期记忆检索 + txt 附件拉取。"""
    memory_context = semantic_memory.format_memory_context(
        query=user_message, user_id=user_id
    )
    text_supplements: list[tuple[str, str]] = []

    try:
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

    return memory_context, text_supplements

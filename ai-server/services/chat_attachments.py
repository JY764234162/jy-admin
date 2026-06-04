"""聊天附件解析：将 COS 附件转为 LLM 可消费的多模态消息。"""

from __future__ import annotations

from typing import Any

import requests

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_TEXT_FILE_CHARS = 8000
TEXT_FETCH_TIMEOUT = 10


def content_to_display_text(content: Any) -> str:
    """将 LangChain 多模态 content（str 或 [{type,text}, ...]）转为前端可展示的纯文本。"""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if text:
                    parts.append(str(text))
        return "\n".join(parts)
    if isinstance(content, dict) and content.get("type") == "text":
        return str(content.get("text") or "")
    return str(content)


def fetch_text_attachment(url: str, max_chars: int = MAX_TEXT_FILE_CHARS) -> str:
    """拉取 .txt 附件正文（失败时返回空字符串）。"""
    if not url:
        return ""
    try:
        resp = requests.get(url, timeout=TEXT_FETCH_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.encoding or "utf-8"
        return (resp.text or "")[:max_chars]
    except Exception as e:
        print(f"[chat] 拉取文本附件失败: {url}, {e}")
        return ""


def build_attachment_memory_context(
    attachments_list: list[dict[str, Any]], base_memory: str = ""
) -> str:
    """生成注入 system prompt 的附件说明（含 URL，便于模型引用）。"""
    if not attachments_list:
        return base_memory

    lines: list[str] = []
    for att in attachments_list:
        fname = att.get("filename", "未知文件")
        ftype = att.get("file_type", "")
        url = att.get("url", "")
        if ftype in IMAGE_EXTENSIONS:
            lines.append(f"图片：{fname}（{url}）" if url else f"图片：{fname}")
        else:
            lines.append(f"文件：{fname}（{url}）" if url else f"文件：{fname}")

    attachment_block = (
        "用户本次消息携带了以下附件（已上传至云端，可直接查看图片或阅读文本内容）：\n"
        + "\n".join(lines)
    )
    if base_memory:
        return f"{attachment_block}\n\n{base_memory}"
    return attachment_block


def build_human_message_content(
    message: str,
    attachments_list: list[dict[str, Any]] | None = None,
    image_url: str = "",
    text_supplements: list[tuple[str, str]] | None = None,
) -> str | list[dict[str, Any]]:
    """构造 HumanMessage.content：文本 + 图片 URL（OpenAI 多模态格式）。"""
    text = message.strip()
    extra_parts: list[str] = []

    for fname, body in text_supplements or []:
        if body.strip():
            extra_parts.append(f"【附件 {fname}】\n{body.strip()}")

    if extra_parts:
        text = f"{text}\n\n" + "\n\n".join(extra_parts) if text else "\n\n".join(extra_parts)

    image_urls: list[str] = []
    if image_url:
        image_urls.append(image_url)

    for att in attachments_list or []:
        url = (att.get("url") or "").strip()
        ftype = (att.get("file_type") or "").lower()
        if ftype in IMAGE_EXTENSIONS and url and url not in image_urls:
            image_urls.append(url)

    if not image_urls:
        return text

    content: list[dict[str, Any]] = [{"type": "text", "text": text or "请分析用户上传的图片。"}]
    for url in image_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    return content

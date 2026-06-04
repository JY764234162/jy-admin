"""Chat 业务逻辑模块。"""

from .attachments_prep import parse_attachments_list, prepare_memory_and_attachments
from .background import run_chat_background
from .persistence import get_conversation, on_user_message_received, persist_chat_result
from .resume_stream import build_resume_response
from .schemas import ChatRequest, ResumeRequest
from .sse import sse_json, stream_from_buffer

__all__ = [
    "ChatRequest",
    "ResumeRequest",
    "build_resume_response",
    "get_conversation",
    "on_user_message_received",
    "parse_attachments_list",
    "persist_chat_result",
    "prepare_memory_and_attachments",
    "run_chat_background",
    "sse_json",
    "stream_from_buffer",
]

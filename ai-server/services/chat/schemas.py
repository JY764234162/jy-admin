"""Chat 请求/响应模型。"""

from typing import Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str = ""
    conversationId: Optional[int] = None
    attachments: Optional[str] = "[]"
    enable_knowledge: Optional[bool] = False
    enable_search: Optional[bool] = False


class ResumeRequest(BaseModel):
    conversationId: int
    enable_knowledge: Optional[bool] = False
    enable_search: Optional[bool] = False

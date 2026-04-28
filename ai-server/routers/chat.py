from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from services.llm import llm
from services.memory import memory

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


@router.post("")
async def chat_message(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")

    # 创建或复用对话
    if not req.conversation_id:
        conversation_id = memory.create_conversation()
    else:
        conversation_id = req.conversation_id
        # 验证对话存在
        convs = memory.get_conversations()
        if not any(c["id"] == conversation_id for c in convs):
            raise HTTPException(404, f"对话 {conversation_id} 不存在")

    # 添加用户消息
    memory.add_message(conversation_id, "user", req.message)

    # 获取对话历史
    messages = memory.get_messages(conversation_id)

    # 构建 LangChain 消息格式
    langchain_messages = []
    for msg in messages:
        langchain_messages.append({"role": msg["role"], "content": msg["content"]})

    async def event_generator():
        full_response = ""
        for chunk in llm.stream(langchain_messages):
            if chunk.content:
                full_response += chunk.content
                yield {"data": chunk.content}

        # 保存 AI 回复
        memory.add_message(conversation_id, "assistant", full_response)
        yield {"data": "[DONE]"}

    # 返回 SSE 流，同时在 header 中返回 conversation_id
    response = EventSourceResponse(event_generator())
    response.headers["X-Conversation-Id"] = conversation_id
    return response


@router.get("/{conversation_id}/history")
async def get_chat_history(conversation_id: str):
    messages = memory.get_messages(conversation_id)
    if not messages:
        raise HTTPException(404, f"对话 {conversation_id} 不存在或为空")
    return {"conversation_id": conversation_id, "messages": messages}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    ok = memory.delete_conversation(conversation_id)
    if not ok:
        raise HTTPException(404, f"对话 {conversation_id} 不存在")
    return {"message": f"对话 {conversation_id} 已删除"}


@router.get("/list")
async def list_conversations():
    return {"conversations": memory.get_conversations()}

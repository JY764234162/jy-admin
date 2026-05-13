import asyncio
import json
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.llm import llm
from services.memory import memory

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("")
async def chat_message(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")

    # 创建或复用对话
    if not req.conversation_id:
        conversation_id = memory.create_conversation()
    else:
        conversation_id = req.conversation_id
        # 验证对话存在（仅当没有外部传入 messages 时才需要）
        if not req.messages:
            convs = memory.get_conversations()
            if not any(c["id"] == conversation_id for c in convs):
                raise HTTPException(404, f"对话 {conversation_id} 不存在")

    # 添加用户消息到 memory（用于后续通过 history 接口查询）
    memory.add_message(conversation_id, "user", req.message)

    # 构建 LangChain 消息格式
    # 优先使用外部传入的 messages（由 Go 后端提供完整历史），否则从 memory 获取
    langchain_messages = []
    if req.messages:
        for msg in req.messages:
            langchain_messages.append({"role": msg.role, "content": msg.content})
        # 追加当前消息
        langchain_messages.append({"role": "user", "content": req.message})
    else:
        messages = memory.get_messages(conversation_id)
        for msg in messages:
            langchain_messages.append({"role": msg["role"], "content": msg["content"]})

    async def event_generator():
        full_response = ""
        try:
            # llm.stream 是同步生成器，放到线程池中执行避免阻塞 asyncio 事件循环
            sync_gen = llm.stream(langchain_messages)
            loop = asyncio.get_event_loop()

            def next_chunk():
                try:
                    return next(sync_gen)
                except StopIteration:
                    return None

            while True:
                chunk = await loop.run_in_executor(None, next_chunk)
                if chunk is None:
                    break
                if chunk.content:
                    full_response += chunk.content
                    yield _sse_json({"content": chunk.content, "done": False})
                    await asyncio.sleep(0.08)

            # 保存 AI 回复到 memory
            memory.add_message(conversation_id, "assistant", full_response)
            yield _sse_json({"content": "", "done": True, "conversation_id": conversation_id})
        except Exception as e:
            yield _sse_json({"content": "", "done": True, "error": str(e)})

    # 返回 SSE 流，同时在 header 中返回 conversation_id
    response = StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )
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

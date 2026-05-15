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
    deep_thinking: Optional[bool] = False


DEEP_THINKING_PROMPT = """You are a helpful assistant with deep reasoning capabilities.

When responding to the user, please follow this exact format:
1. First, wrap your step-by-step reasoning and analysis inside <think> tags
2. Then, provide your final answer after the closing </think> tag

The content inside <think> tags should show your detailed thought process, including:
- Breaking down the problem
- Considering different angles
- Evaluating options
- Reasoning step by step

Example format:
<think>
Let me analyze this carefully...
First, I need to consider...
Then, looking at it from another angle...
Based on this reasoning...
</think>
Your final, concise answer here.

Important: Always include both <think> and </think> tags. Start with <think> and end the thinking section with </think> before giving your final answer."""


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("")
def _extract_thinking(text: str) -> str | None:
    """从文本中提取 <think>...</think> 之间的内容，返回 None 表示标签不完整。"""
    start = text.find("<think>")
    end = text.find("</think>")
    if start != -1 and end != -1 and end > start:
        return text[start + len("<think>"):end].strip()
    return None


def _make_process(thinking_text: str) -> dict:
    """构造兼容 studio.kxsz.net 的 process 数据结构。"""
    if not thinking_text:
        return {
            "plan": {"status": "successful", "message": ""},
            "step": {"status": "successful", "processes": [], "source": []},
            "task_status": "successful",
        }
    return {
        "plan": {"status": "successful", "message": ""},
        "step": {
            "status": "successful",
            "processes": [
                {
                    "step_id": "deep_think",
                    "status": "successful",
                    "message": "",
                    "description": thinking_text,
                }
            ],
            "source": [],
        },
        "task_status": "successful",
    }


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
    if req.deep_thinking:
        langchain_messages.append({"role": "system", "content": DEEP_THINKING_PROMPT})
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
        raw_buffer = ""
        thinking_detected = False
        thinking_complete = False
        thinking_content = ""

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
                if not chunk.content:
                    continue

                full_response += chunk.content
                raw_buffer += chunk.content

                # 深度思考模式：解析 <think> 标签
                if req.deep_thinking:
                    # 首次检测到 <think>，发送 processing 状态
                    if not thinking_detected and "<think>" in raw_buffer:
                        thinking_detected = True
                        yield _sse_json(
                            {
                                "status": "processing",
                                "process": {"plan": {"status": "processing", "message": ""}},
                            }
                        )

                    # 已检测到 <think>，检查是否完整闭合
                    if thinking_detected and not thinking_complete:
                        extracted = _extract_thinking(raw_buffer)
                        if extracted is not None:
                            thinking_complete = True
                            thinking_content = extracted

                            # </think> 之后的内容才是正式答案
                            end_pos = raw_buffer.find("</think>") + len("</think>")
                            answer_so_far = raw_buffer[end_pos:].strip()

                            yield _sse_json(
                                {
                                    "status": "stream_answer_content",
                                    "answer": answer_so_far,
                                    "process": _make_process(thinking_content),
                                }
                            )
                        # 思考完成前，不发送答案内容（避免把思考文本混入答案）
                        await asyncio.sleep(0.08)
                        continue

                    # 思考已完成，继续流式发送答案
                    if thinking_complete:
                        yield _sse_json(
                            {
                                "status": "stream_answer_content",
                                "answer": chunk.content,
                                "process": _make_process(thinking_content),
                            }
                        )
                        await asyncio.sleep(0.08)
                        continue

                # 非深度思考模式：保持原有格式
                yield _sse_json({"content": chunk.content, "done": False})
                await asyncio.sleep(0.08)

            # 保存 AI 回复到 memory
            memory.add_message(conversation_id, "assistant", full_response)

            if req.deep_thinking and thinking_detected:
                yield _sse_json(
                    {
                        "status": "successful",
                        "answer": full_response,
                        "process": _make_process(thinking_content),
                        "done": True,
                    }
                )
            else:
                yield _sse_json(
                    {"content": "", "done": True, "conversation_id": conversation_id}
                )
        except Exception as e:
            if req.deep_thinking and thinking_detected:
                yield _sse_json(
                    {
                        "status": "failed",
                        "answer": full_response,
                        "process": _make_process(thinking_content)
                        if thinking_complete
                        else {
                            "plan": {"status": "failed", "message": str(e)},
                            "step": {"status": "failed", "processes": [], "source": []},
                            "task_status": "failed",
                        },
                        "error": str(e),
                        "done": True,
                    }
                )
            else:
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

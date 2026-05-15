import asyncio
import json
import uuid
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.llm import llm

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


class VisionRequest(BaseModel):
    message: str
    image_base64: str
    conversation_id: Optional[str] = None


@router.post("/vision")
async def chat_vision(req: VisionRequest):
    """多模态视觉对话（GLM-4V），接收 base64 图片 + 文字问题，SSE 流式返回"""
    from services.llm import vision_llm

    if not vision_llm:
        raise HTTPException(503, "多模态模型未配置，请检查 GLM4V_API_KEY")
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")
    if not req.image_base64.strip():
        raise HTTPException(400, "图片不能为空")

    conversation_id = req.conversation_id or uuid.uuid4().hex[:16]

    # 构造多模态消息（OpenAI 兼容格式）
    image_url = req.image_base64
    if not image_url.startswith("data:"):
        # 如果前端只传了裸 base64，补全 data URI
        image_url = f"data:image/jpeg;base64,{image_url}"

    multimodal_messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": req.message},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    ]

    async def event_generator():
        full_response = ""
        try:
            sync_gen = vision_llm.stream(multimodal_messages)
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
                yield _sse_json({"content": chunk.content, "done": False})
                await asyncio.sleep(0.08)

            yield _sse_json({"content": "", "done": True, "conversation_id": conversation_id})
        except Exception as e:
            yield _sse_json({"content": "", "done": True, "error": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )


@router.post("")
async def chat_message(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")

    conversation_id = req.conversation_id or uuid.uuid4().hex[:16]

    # 构建 LangChain 消息格式
    # 优先使用外部传入的 messages（由 Go 后端提供完整历史）
    langchain_messages = []
    if req.deep_thinking:
        langchain_messages.append({"role": "system", "content": DEEP_THINKING_PROMPT})
    if req.messages:
        for msg in req.messages:
            langchain_messages.append({"role": msg.role, "content": msg.content})
        # 追加当前消息
        langchain_messages.append({"role": "user", "content": req.message})
    else:
        # 无外部历史时仅使用当前消息
        langchain_messages.append({"role": "user", "content": req.message})

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



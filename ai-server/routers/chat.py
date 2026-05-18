import asyncio
import json
import uuid
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.messages import HumanMessage, AIMessage

from services.llm import llm
from services.semantic_memory import VectorChatMessageHistory, SemanticMemory

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ========== 语义记忆全局实例 ==========
semantic_memory = SemanticMemory(top_k=5)

# session_id -> VectorChatMessageHistory 的内存缓存（进程内缓存，重启清空）
_session_histories: dict[str, VectorChatMessageHistory] = {}


def get_session_history(session_id: str) -> VectorChatMessageHistory:
    """获取或创建指定会话的 VectorChatMessageHistory（短期记忆窗口）。

    session_id 格式: "{user_id}:{conversation_id}" 或 "{conversation_id}"
    """
    if ":" in session_id:
        user_id, conv_id = session_id.split(":", 1)
    else:
        user_id, conv_id = "", session_id

    if session_id not in _session_histories:
        _session_histories[session_id] = VectorChatMessageHistory(
            session_id=conv_id, user_id=user_id, max_messages=10
        )
    return _session_histories[session_id]


# ========== Prompt & Chain ==========
# 使用 MessagesPlaceholder 承载历史消息，避免 input 重复渲染
# RunnableWithMessageHistory 会自动将 input 转换为 HumanMessage 并注入 history
_chat_prompt = ChatPromptTemplate.from_messages([
    ("system", "{system_content}"),
    MessagesPlaceholder(variable_name="history"),
])

_chat_chain = _chat_prompt | llm

# 带消息历史的 chain：短期记忆窗口（最近 N 条）
chain_with_history = RunnableWithMessageHistory(
    _chat_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="history",
)


# ========== 请求模型 ==========

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    deep_thinking: Optional[bool] = False
    user_id: Optional[str] = ""  # 用于语义记忆隔离


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
        image_url = f"data:image/jpeg;base64,{req.image_base64}"

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
    user_id = req.user_id or ""

    # 获取当前会话的短期记忆
    history = get_session_history(conversation_id, user_id)

    # 首次调用且外部传了 messages：将外部历史导入到 VectorChatMessageHistory
    # 这样 ai-server 自己也能管理历史，后续不再依赖外部传入
    if req.messages and not history.messages:
        lc_messages = []
        for msg in req.messages:
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                lc_messages.append(AIMessage(content=msg.content))
        if lc_messages:
            history.add_messages(lc_messages)

    # 语义检索：跨会话召回与当前问题相关的长期记忆
    memory_context = semantic_memory.format_memory_context(req.message, user_id)

    # 组装 system prompt
    if req.deep_thinking:
        system_content = DEEP_THINKING_PROMPT
    else:
        system_content = "你是一个有用的助手。"
    if memory_context:
        system_content += f"\n\n{memory_context}"

    async def event_generator():
        full_response = ""
        raw_buffer = ""
        thinking_detected = False
        thinking_complete = False
        thinking_content = ""

        try:
            # 使用 RunnableWithMessageHistory 的异步流式输出
            # input 为字符串时，RunnableWithMessageHistory 会自动转换为 HumanMessage
            # 并注入历史消息到 MessagesPlaceholder
            # session_id 编码 user_id 用于隔离不同用户的记忆
            session_key = f"{user_id}:{conversation_id}" if user_id else conversation_id
            async for chunk in chain_with_history.astream(
                {"input": req.message, "system_content": system_content},
                config={"configurable": {"session_id": session_key}},
            ):
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

            # 流式结束后，保存本轮交互到语义记忆（长期记忆）
            if full_response.strip():
                semantic_memory.save_interaction(
                    req.message, full_response, conversation_id, user_id
                )

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

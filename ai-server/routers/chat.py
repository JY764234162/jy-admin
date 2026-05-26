import asyncio
import json
import uuid
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from sqlalchemy.orm import Session

from services.llm import llm
from services.storage.long_term_memory import get_memory
from services.llm import stream_chat
from services.llm import stream_agent
from services.middleware import get_current_user, UserContext
from models.conversation import Conversation, get_db, SessionLocal

router = APIRouter(prefix="/api/ai/chat", tags=["chat"])

# ========== 长期记忆全局实例（PostgresStore）==========
semantic_memory = get_memory(top_k=5)


# ========== 请求模型 ==========

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    deep_thinking: Optional[bool] = False
    user_id: Optional[str] = ""  # 用于语义记忆隔离（向后兼容）
    attachments: Optional[str] = "[]"  # JSON 字符串，附件信息


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 数据库持久化辅助函数 ==========

def _persist_chat_result(
    conv_id: int, content: str, status: str, user_msg: str, attachments: str = "[]"
):
    """更新会话元数据（不再写入 messages 表，消息由 Checkpoint 管理）。"""
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            last = user_msg[:100] if len(user_msg) > 100 else user_msg
            conv.last_msg = last
            conv.message_count += 2
            conv.latest_status = status
            conv.latest_attachments = attachments
            db.commit()
    except Exception as e:
        print(f"[chat] 持久化失败: {e}")
    finally:
        db.close()


class VisionRequest(BaseModel):
    message: str
    image_base64: str
    conversation_id: Optional[str] = None


@router.post("/vision")
async def chat_vision(
    req: VisionRequest,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """多模态视觉对话（GLM-4V），接收 base64 图片 + 文字问题，SSE 流式返回"""
    from services.llm import vision_llm

    if not vision_llm:
        raise HTTPException(503, "多模态模型未配置，请检查 GLM4V_API_KEY")
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")
    if not req.image_base64.strip():
        raise HTTPException(400, "图片不能为空")

    user_id = user.id if user else 0
    if not user_id:
        raise HTTPException(401, "未登录")

    conversation_id = req.conversation_id or uuid.uuid4().hex[:16]

    # 验证会话并更新元数据
    conv_db_id = None
    if req.conversation_id:
        try:
            conv_id_int = int(req.conversation_id)
            conv = db.query(Conversation).filter(
                Conversation.id == conv_id_int,
                Conversation.user_id == user_id,
            ).first()
            if conv:
                conv_db_id = conv.id
        except ValueError:
            pass

    # 构造多模态消息（OpenAI 兼容格式）
    image_url = req.image_base64
    if not image_url.startswith("data:"):
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
        error_msg = None
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
            error_msg = str(e)
            yield _sse_json({"content": "", "done": True, "error": error_msg})
        finally:
            if conv_db_id:
                status = "error" if error_msg else "success"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    _persist_chat_result,
                    conv_db_id,
                    full_response,
                    status,
                    req.message.strip(),
                    "[]",
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )


@router.post("")
async def chat_message(
    req: ChatRequest,
    user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not req.message.strip():
        raise HTTPException(400, "消息不能为空")

    # user_id 优先从 JWT 获取，fallback 到请求体（向后兼容）
    user_id = user.id if user else (req.user_id or "")
    if not user_id:
        raise HTTPException(401, "未登录")

    conversation_id = req.conversation_id or uuid.uuid4().hex[:16]

    # 验证会话存在且属于当前用户
    conv = None
    if req.conversation_id:
        try:
            conv_id_int = int(req.conversation_id)
            conv = db.query(Conversation).filter(
                Conversation.id == conv_id_int,
                Conversation.user_id == user_id,
            ).first()
        except ValueError:
            pass

    if req.conversation_id and not conv:
        raise HTTPException(404, "会话不存在或无权限")

    # 会话数据库 ID（用于保存元数据）
    conv_db_id = conv.id if conv else None

    # 语义检索：跨会话召回与当前问题相关的长期记忆
    memory_context = semantic_memory.format_memory_context(req.message, str(user_id))

    # thread_id 用于 Checkpoint
    session_key = f"{user_id}:{conversation_id}" if user_id else conversation_id

    async def event_generator():
        full_response = ""
        error_msg = None

        try:
            if req.deep_thinking:
                # Agent 深度思考流程
                async for event in stream_agent(
                    req.message, session_key, str(user_id), memory_context
                ):
                    data_str = event.removeprefix("data: ").strip()
                    try:
                        data = json.loads(data_str)
                        if data.get("answer"):
                            full_response = data["answer"]
                    except Exception:
                        pass
                    yield event
            else:
                # 普通聊天流程（LangGraph + Checkpoint）
                async for event in stream_chat(
                    req.message, session_key, memory_context
                ):
                    data_str = event.removeprefix("data: ").strip()
                    try:
                        data = json.loads(data_str)
                        if data.get("content"):
                            full_response += data["content"]
                        if data.get("done"):
                            # 补充 conversation_id 到最终事件
                            yield _sse_json({
                                "content": "",
                                "done": True,
                                "conversation_id": conversation_id,
                            })
                            continue
                    except Exception:
                        pass
                    yield event

            # 流式结束后，保存本轮交互到语义记忆（长期记忆）
            if full_response.strip():
                semantic_memory.save_interaction(
                    req.message, full_response, conversation_id, str(user_id)
                )
        except Exception as e:
            error_msg = str(e)
            yield _sse_json({"content": "", "done": True, "error": error_msg})
        finally:
            # 持久化会话元数据
            if conv_db_id:
                status = "error" if error_msg else "success"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    _persist_chat_result,
                    conv_db_id,
                    full_response,
                    status,
                    req.message.strip(),
                    req.attachments or "[]",
                )

    # 返回 SSE 流，同时在 header 中返回 conversation_id
    response = StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )
    return response

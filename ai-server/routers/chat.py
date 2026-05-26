import asyncio
import json
import uuid
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.messages import HumanMessage, AIMessage
from langchain.agents import create_agent
from sqlalchemy.orm import Session

from services.llm import llm
from services.semantic_memory import VectorChatMessageHistory, SemanticMemory
from services.agent_tools import get_tools
from services.auth import get_current_user, UserContext
from models.conversation import Conversation, Message, get_db

router = APIRouter(prefix="/api/ai/chat", tags=["chat"])

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
    user_id: Optional[str] = ""  # 用于语义记忆隔离（向后兼容）
    attachments: Optional[str] = "[]"  # JSON 字符串，附件信息


AGENT_SYSTEM_PROMPT = """你是一个智能助手，擅长通过调用工具来解决问题。

在回答用户问题之前，请先分析是否需要调用工具。如果需要，请按以下步骤执行：
1. 分析用户需求，确定需要调用哪些工具
2. 调用工具获取信息
3. 基于工具返回的结果进行推理
4. 给出完整、准确的回答

可用的工具包括：
- search_knowledge: 搜索知识库，获取已上传文档中的相关信息
- calculator: 计算数学表达式

请用中文思考和回答。"""


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 数据库持久化辅助函数 ==========

def _persist_chat_result(ai_msg_id: int, conv_id: int, content: str, status: str, user_msg: str):
    """在独立 Session 中更新 AI 消息状态和会话元数据。

    供 event_generator 的 finally 块调用，避免生成器内直接操作已关闭的 Session。
    """
    from models.conversation import SessionLocal
    db = SessionLocal()
    try:
        # 更新 AI 消息
        ai_msg = db.query(Message).filter(Message.id == ai_msg_id).first()
        if ai_msg:
            ai_msg.content = content
            ai_msg.status = status
            db.commit()

        # 更新会话
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if conv:
            last = user_msg[:100] if len(user_msg) > 100 else user_msg
            conv.last_msg = last
            conv.message_count += 2
            db.commit()
    except Exception as e:
        print(f"[chat] 持久化失败: {e}")
    finally:
        db.close()


def _make_process_with_steps(steps: list[dict]) -> dict:
    """从步骤列表构造兼容 studio.kxsz.net 的 process 数据结构。"""
    return {
        "plan": {"status": "successful", "message": ""},
        "step": {
            "status": "successful",
            "processes": steps,
            "source": [],
        },
        "task_status": "successful",
    }


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

    # 验证会话
    conv_db_id = None
    ai_msg_id = None
    if req.conversation_id:
        try:
            conv_id_int = int(req.conversation_id)
            conv = db.query(Conversation).filter(
                Conversation.id == conv_id_int,
                Conversation.user_id == user_id,
            ).first()
            if conv:
                conv_db_id = conv.id
                # 保存用户消息
                user_msg = Message(
                    conversation_id=conv_db_id,
                    role="user",
                    content=req.message.strip(),
                    user_id=user_id,
                )
                db.add(user_msg)
                db.commit()
                # AI 占位
                ai_msg = Message(
                    conversation_id=conv_db_id,
                    role="assistant",
                    content="",
                    user_id=user_id,
                    status="loading",
                )
                db.add(ai_msg)
                db.commit()
                db.refresh(ai_msg)
                ai_msg_id = ai_msg.id
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
            if ai_msg_id and conv_db_id:
                status = "error" if error_msg else "success"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    _persist_chat_result,
                    ai_msg_id,
                    conv_db_id,
                    full_response,
                    status,
                    req.message.strip(),
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )


async def _run_agent_stream(
    req: ChatRequest,
    conversation_id: str,
    user_id: str,
    session_key: str,
):
    """Agent 深度思考流式输出 generator。

    使用 LangChain create_agent（CompiledStateGraph），通过 astream 实时捕获
    agent / tools 节点的输出，推送 SSE 事件展示思考过程。
    """
    # 语义检索：跨会话召回与当前问题相关的长期记忆
    memory_context = semantic_memory.format_memory_context(req.message, user_id)

    # 获取当前会话的短期记忆（最近 N 条）
    history = get_session_history(session_key)
    past_messages = history.messages

    # 组装 Agent system prompt
    system_prompt = AGENT_SYSTEM_PROMPT
    if memory_context:
        system_prompt += f"\n\n{memory_context}"

    # 工具
    tools = get_tools(user_id)

    # 创建 Agent（CompiledStateGraph）
    agent = create_agent(llm, tools=tools, system_prompt=system_prompt)

    messages = past_messages + [HumanMessage(content=req.message)]

    # 初始分析步骤
    yield _sse_json({
        "status": "processing",
        "process": _make_process_with_steps([{
            "step_id": "analysis",
            "status": "processing",
            "message": "",
            "description": "正在分析问题，准备调用工具...",
        }]),
    })
    await asyncio.sleep(0.08)

    steps: list[dict] = []
    final_output = ""

    # 流式执行 Agent，stream_mode="updates" 获取每个节点的增量输出
    async for chunk in agent.astream(
        {"messages": messages}, stream_mode="updates"
    ):
        for node_name, node_output in chunk.items():
            if node_name == "model":
                for msg in node_output.get("messages", []):
                    # 工具调用决策
                    tool_calls = getattr(msg, "tool_calls", None)
                    if tool_calls:
                        for tc in tool_calls:
                            tool_name = tc.get("name", "unknown")
                            steps.append({
                                "step_id": tool_name,
                                "status": "processing",
                                "message": "",
                                "description": f"正在调用工具：{tool_name}...",
                            })
                    # 纯文本回答（无工具调用）——可能是最终答案
                    elif msg.content and not tool_calls:
                        final_output = msg.content

            elif node_name == "tools":
                for msg in node_output.get("messages", []):
                    if getattr(msg, "type", "") == "tool":
                        # 更新最后一步为 successful，并记录工具返回
                        if steps:
                            steps[-1]["status"] = "successful"
                            steps[-1]["description"] = f"工具返回：{str(msg.content)[:300]}"

        # 有步骤更新时实时推送
        if steps:
            yield _sse_json({
                "status": "processing",
                "process": _make_process_with_steps(steps),
            })
            await asyncio.sleep(0.08)

    # 推送最终答案
    if final_output:
        yield _sse_json({
            "status": "stream_answer_content",
            "answer": final_output,
            "process": _make_process_with_steps(steps),
        })
        await asyncio.sleep(0.08)

    # 完成
    yield _sse_json({
        "status": "successful",
        "answer": final_output,
        "process": _make_process_with_steps(steps),
        "done": True,
    })


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

    # 会话数据库 ID（用于保存消息）
    conv_db_id = conv.id if conv else None

    # 保存用户消息
    if conv_db_id:
        user_msg = Message(
            conversation_id=conv_db_id,
            role="user",
            content=req.message.strip(),
            user_id=user_id,
            attachments=req.attachments or "[]",
        )
        db.add(user_msg)
        db.commit()

        # 插入 AI 占位消息（loading）
        ai_msg = Message(
            conversation_id=conv_db_id,
            role="assistant",
            content="",
            user_id=user_id,
            status="loading",
        )
        db.add(ai_msg)
        db.commit()
        db.refresh(ai_msg)
        ai_msg_id = ai_msg.id
    else:
        ai_msg_id = None

    # 获取当前会话的短期记忆
    session_key = f"{user_id}:{conversation_id}" if user_id else conversation_id
    history = get_session_history(session_key)

    # 首次调用且外部传了 messages：将外部历史导入到 VectorChatMessageHistory
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
    memory_context = semantic_memory.format_memory_context(req.message, str(user_id))

    # 组装 system prompt（仅普通聊天模式使用）
    system_content = "你是一个有用的助手。"
    if memory_context:
        system_content += f"\n\n{memory_context}"

    async def event_generator():
        full_response = ""
        error_msg = None

        try:
            if req.deep_thinking:
                # Agent 深度思考流程：真正的 ReAct Agent，调用工具并展示步骤
                async for event in _run_agent_stream(req, conversation_id, str(user_id), session_key):
                    data_str = event.removeprefix("data: ").strip()
                    try:
                        data = json.loads(data_str)
                        if data.get("answer"):
                            full_response = data["answer"]
                    except Exception:
                        pass
                    yield event
            else:
                # 普通聊天流程：RunnableWithMessageHistory + 短期记忆窗口
                async for chunk in chain_with_history.astream(
                    {"input": req.message, "system_content": system_content},
                    config={"configurable": {"session_id": session_key}},
                ):
                    if not chunk.content:
                        continue
                    full_response += chunk.content
                    yield _sse_json({"content": chunk.content, "done": False})
                    await asyncio.sleep(0.08)

                yield _sse_json(
                    {"content": "", "done": True, "conversation_id": conversation_id}
                )

            # 流式结束后，保存本轮交互到语义记忆（长期记忆）
            if full_response.strip():
                semantic_memory.save_interaction(
                    req.message, full_response, conversation_id, str(user_id)
                )
        except Exception as e:
            error_msg = str(e)
            yield _sse_json({"content": "", "done": True, "error": error_msg})
        finally:
            # 持久化 AI 消息状态和会话元数据
            if ai_msg_id and conv_db_id:
                status = "error" if error_msg else "success"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    _persist_chat_result,
                    ai_msg_id,
                    conv_db_id,
                    full_response,
                    status,
                    req.message.strip(),
                )

    # 返回 SSE 流，同时在 header 中返回 conversation_id
    response = StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Conversation-Id": conversation_id},
    )
    return response

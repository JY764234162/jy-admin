"""普通聊天的 LangGraph StateGraph。

用 Checkpoint 自动管理消息历史，替代 RunnableWithMessageHistory + VectorChatMessageHistory。
"""

import asyncio
import json
from typing import AsyncIterator, Callable

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import END, START, MessagesState, StateGraph

from services.storage.checkpoint_store import get_saver, get_async_saver
from .llm import llm


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def make_chat_node(memory_context: str = "") -> Callable:
    """创建带有语义记忆注入的聊天节点（闭包）。"""
    system_content = "你是一个有用的助手。"
    if memory_context:
        system_content += f"\n\n{memory_context}"

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_content),
        MessagesPlaceholder(variable_name="messages"),
    ])
    chain = prompt | llm

    def _node(state: MessagesState):
        response = chain.invoke(state)
        return {"messages": [response]}

    return _node


def build_chat_graph(memory_context: str = "", checkpointer=None):
    """构建并编译普通聊天的 LangGraph。"""
    builder = StateGraph(MessagesState)
    builder.add_node("chat", make_chat_node(memory_context))
    builder.add_edge(START, "chat")
    builder.add_edge("chat", END)
    return builder.compile(checkpointer=checkpointer or get_saver())


async def stream_chat(
    message: str,
    thread_id: str,
    memory_context: str = "",
) -> AsyncIterator[str]:
    """普通聊天的流式 SSE 输出。

    Args:
        message: 用户输入
        thread_id: 格式 "{user_id}:{conversation_id}"
        memory_context: 语义记忆上下文（可选）
    """
    saver = await get_async_saver()
    graph = build_chat_graph(memory_context, checkpointer=saver)
    config = {"configurable": {"thread_id": thread_id}}

    async for msg, metadata in graph.astream(
        {"messages": [HumanMessage(content=message)]},
        config,
        stream_mode="messages",
    ):
        if hasattr(msg, "content") and msg.content:
            yield _sse_json({"content": msg.content, "done": False})
            await asyncio.sleep(0.08)

    yield _sse_json({"content": "", "done": True})

"""Agent 流式 SSE 输出。

使用 create_react_agent 构建 ReAct Agent：
- llm 从 .llm 模块导入（已初始化的全局单例）
- Agent 按 (user_id, enable_knowledge, enable_search, system_prompt) 缓存，避免重复创建
- 通过 agent.stream(stream_mode="messages") 获取模型/工具节点的输出
"""

import asyncio
import json
from typing import AsyncIterator

from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from services.storage.checkpoint_store import get_saver, get_thread_messages
from services.tools.knowledge_tools import make_search_knowledge_tool, make_list_knowledge_tool
from services.tools.search_tools import make_tavily_search_tool
from .llm import llm
from .response_filter import sanitize_response

# ========== 系统提示词 ==========
AGENT_SYSTEM_PROMPT = """你叫芳芳，是一个智能助手。

你拥有以下工具，回答用户问题时**必须**按需调用：
- **search_knowledge**：查询用户上传的文档内容
- **list_knowledge**：列出用户知识库中的文档
- **tavilysearch**：联网搜索互联网上的最新信息

## 核心规则

1. **只要问题涉及时效性信息（"今天""最近""最新""新闻""天气""股价"等），必须调用 tavilysearch 工具，禁止凭记忆回答。**
2. **只要问题涉及文档内容或知识库中的信息，必须调用 search_knowledge 工具。**
3. 只有纯闲聊（"你好""谢谢"）才不需要工具。
4. 调用工具后，根据返回结果组织回答。不要编造未返回的信息。

## 引用规范

- 知识库内容标注：`【来源：文件名】`
- 联网搜索内容标注：正文中用 `[index]` 上标引用（如 `OpenAI 发布了新模型[1]`），回答末尾列出完整来源：`[index] [网页标题](URL)`
- 搜索结果中的图片可以用 `![描述](URL)` 展示

## 绝对禁止

- 回答中**不得**出现"我调用了""我使用了""工具返回"等描述
- 回答中**不得**提及任何工具名称
- 不得凭记忆回答涉及时效性的问题

请用中文回答。"""


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 工具创建 ==========


def make_tools(user_id: str = "", enable_knowledge: bool = True, enable_search: bool = False):
    """创建已绑定 user_id 的工具列表。"""
    from langchain_core.tools import tool

    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id)
        tools.append(search_knowledge)
        list_knowledge = make_list_knowledge_tool(user_id=user_id)
        tools.append(list_knowledge)

    if enable_search:
        tavilysearch = make_tavily_search_tool()
        tools.append(tavilysearch)
        print(f"[AGENT] 已挂载联网搜索工具 (enable_search=True)")

    return tools


# ========== Agent 单例缓存 ==========

_agent_cache: dict = {}


def _get_agent(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str):
    """获取或创建 Agent 实例（按参数缓存，避免重复创建）。"""
    key = (user_id, enable_knowledge, enable_search, system_prompt)
    if key not in _agent_cache:
        tools = make_tools(user_id, enable_knowledge, enable_search)
        tool_names = [t.name for t in tools]
        print(f"[AGENT] 创建新 Agent: key={key}, tools={tool_names}")
        prompt = system_prompt or AGENT_SYSTEM_PROMPT
        _agent_cache[key] = create_react_agent(
            llm,
            tools=tools,
            prompt=prompt,
            checkpointer=get_saver(),
        )
    else:
        print(f"[AGENT] 命中缓存 Agent: key={key}")
    return _agent_cache[key]


# ========== 主函数：流式 SSE 输出 ==========


async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 和 enable_search 动态挂载工具。
    """
    print(f"[AGENT] stream_agent 参数: enable_knowledge={enable_knowledge}, enable_search={enable_search}, user_id={user_id}")
    # 1. 获取缓存的 Agent 实例
    agent = _get_agent(user_id, enable_knowledge, enable_search, memory_context)

    # 2. 构造消息（历史 + 当前输入）
    past_messages = get_thread_messages(thread_id)
    if image_url:
        content = [
            {"type": "text", "text": message},
            {"type": "image", "url": image_url},
        ]
    else:
        content = message
    messages = past_messages + [HumanMessage(content=content)]

    # 3. 遍历 Agent 输出，只返回 content（不展示工具过程）
    config = {"configurable": {"thread_id": thread_id}}

    for msg, metadata in agent.stream(
        {"messages": messages}, config, stream_mode="messages"
    ):
        node_name = metadata.get("langgraph_node", "")

        if node_name in ("model", "agent"):
            # 跳过工具调用消息（只向用户暴露最终回答，不暴露工具调用过程）
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                continue

            token = getattr(msg, "content", "")
            if token:
                yield _sse_json({"content": sanitize_response(str(token))})
                await asyncio.sleep(0.01)

    # 4. 完成
    yield _sse_json({"done": True})

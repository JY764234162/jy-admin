"""Agent 流式 SSE 输出。

【架构说明：LangGraph StateGraph vs create_react_agent】
--------------------------------------------------------------------------------
原方案（create_react_agent）：
  - 一个黑盒函数封装了 ReAct 循环的全部逻辑
  - 提示词和工具列表是分离的两样东西，容易出现"提示词让模型调用某工具，但工具列表里根本没有"的错位
  - 无法干预"什么情况下该调用工具""工具失败后怎么办"等内部逻辑
  - stream_mode="messages" 的流式输出由内部封装处理

本方案（LangGraph StateGraph）：
  - 显式定义状态（AgentState）、节点（agent/tools）和条件边（should_continue）
  - agent 节点内部同时控制"系统提示词内容"和"绑定的工具列表"，二者始终保持一致
  - 条件边完全开放：可自定义重试策略、最大轮次、根据工具返回结果走不同分支
  - stream_mode="messages" 同样支持逐 token 流式，且过滤逻辑更清晰
--------------------------------------------------------------------------------
"""

import asyncio
import json
from typing import Annotated, AsyncIterator, TypedDict

from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableLambda
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from services.storage.checkpoint_store import get_saver, get_thread_messages
from services.tools.knowledge_tools import make_list_knowledge_tool, make_search_knowledge_tool
from services.tools.search_tools import make_tavily_search_tool
from .llm import llm
from .response_filter import sanitize_response


# ========== 动态系统提示词构建 ==========

def build_system_prompt(enable_knowledge: bool = True, enable_search: bool = False) -> str:
    """根据实际挂载的工具动态构建系统提示词。

    【与 create_react_agent 的关键区别】
    create_react_agent 把提示词和工具列表分开管理，容易出现错位。
    StateGraph 在 agent 节点里同时控制 prompt 和 llm.bind_tools(tools)，
    保证模型"看到的工具"和"被告诉要用的工具"永远是同一批。
    """
    tools_desc = []
    rules = []

    if enable_knowledge:
        tools_desc.extend([
            "- **search_knowledge**：查询用户上传的文档内容",
            "- **list_knowledge**：列出用户知识库中的文档",
        ])
        rules.append("只要问题涉及文档内容或知识库中的信息，必须调用 search_knowledge 工具。")

    if enable_search:
        tools_desc.append("- **tavilysearch**：联网搜索互联网上的最新信息")
        rules.extend([
            "只要问题涉及时效性信息（'今天''最近''最新''新闻''天气''股价'等），必须调用 tavilysearch 工具，禁止凭记忆回答。",
            "历史消息中的旧搜索结果可能已经过期，每次回答涉及时效性问题时必须重新调用工具，不得依赖历史中的旧数据。",
        ])
    else:
        # 明确告诉模型：你没有这个能力，不要假装有
        rules.append(
            "你**没有**联网搜索能力。对于涉及时效性的问题，请诚实告知用户你无法获取实时信息，不要编造。"
        )

    # 通用规则（始终生效）
    rules.extend([
        "只有纯闲聊（'你好''谢谢'）才不需要工具。",
        "调用工具后，根据返回结果组织回答。不要编造未返回的信息。",
    ])

    tools_section = "\n".join(tools_desc) if tools_desc else "（当前没有可用的工具）"
    rules_section = "\n".join(f"{i + 1}. {r}" for i, r in enumerate(rules))

    # 未启用搜索时，额外加一条禁止生成工具调用标记的约束
    search_restriction = (
        ""
        if enable_search
        else "- 你未启用联网搜索，**严禁**生成 [tavilysearch] 等工具调用标记，严禁假装执行了搜索"
    )

    return f"""你叫芳芳，是一个智能助手。

你拥有以下工具，回答用户问题时**必须**按需调用：
{tools_section}

## 核心规则
{rules_section}

## 引用规范
- 知识库内容标注：`【来源：文件名】`
- 联网搜索内容标注：正文中用 `[index]` 上标引用（如 `OpenAI 发布了新模型[1]`），回答末尾列出完整来源：`[index] [网页标题](URL)`
- 搜索结果中的图片可以用 `![描述](URL)` 展示

## 绝对禁止
- 回答中**不得**出现"我调用了""我使用了""工具返回"等描述
- 回答中**不得**提及任何工具名称
- 不得凭记忆回答涉及时效性的问题
{search_restriction}

请用中文回答。"""


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 工具创建 ==========


def make_tools(user_id: str = "", enable_knowledge: bool = True, enable_search: bool = False):
    """创建已绑定 user_id 的工具列表。"""
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


# ========== LangGraph 状态定义 ==========

class AgentState(TypedDict):
    """LangGraph 显式状态定义。

    【与 create_react_agent 的关键区别】
    create_react_agent 的状态是隐式的，你拿不到中间过程。
    StateGraph 要求显式定义状态结构，每个节点读取/写入状态的哪些字段完全可控。
    这里的 `messages` 用 `add_messages` 做 reducer，保证多节点写入时自动追加而不是覆盖。
    """
    messages: Annotated[list, add_messages]


# ========== 条件边：判断是否继续调用工具 ==========

def should_continue(state: AgentState) -> str:
    """条件边：根据最后一条消息决定是否进入工具节点。

    【与 create_react_agent 的关键区别】
    create_react_agent 的工具调用循环是写死的内部逻辑，你无法干预。
    StateGraph 的条件边是显式函数，你可以在这里做很多事情：
      - 限制最大工具调用轮次（防止无限循环）
      - 某工具失败后改走其他分支（降级策略）
      - 根据工具返回结果决定下一步动作
    """
    last_message = state["messages"][-1]
    # AIMessage 包含 tool_calls 字段时，说明模型要求调用工具
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    # 没有工具调用，直接结束
    return END


# ========== Graph 构建与缓存 ==========

_graph_cache: dict = {}


def _build_graph(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""):
    """构建并编译 StateGraph。

    【与 create_react_agent 的关键区别】
    create_react_agent 是一句话调用：create_react_agent(llm, tools, prompt)。
    StateGraph 需要显式拼图：定义节点 → 添加节点 → 连边 → 编译。
    代码量多一点，但每个环节都清晰可见、可修改。
    """
    # 1. 创建实际挂载的工具列表
    tools = make_tools(user_id=user_id, enable_knowledge=enable_knowledge, enable_search=enable_search)
    tool_names = [t.name for t in tools]
    print(
        f"[AGENT] 构建 Graph: user_id={user_id}, tools={tool_names}, "
        f"enable_knowledge={enable_knowledge}, enable_search={enable_search}"
    )

    # 2. 构建系统提示词（根据工具可用性动态生成）
    prompt_text = (
        system_prompt if system_prompt else build_system_prompt(enable_knowledge=enable_knowledge, enable_search=enable_search)
    )

    # 3. 构建 agent 节点（Runnable）
    #
    # 【流式输出的关键】ChatPromptTemplate | llm.bind_tools(tools) 是一个标准 Runnable，
    # LangGraph 内部会自动调用它的 astream 方法，因此 stream_mode="messages" 仍然可以
    # 逐 token 地流式输出，和 create_react_agent 的体验完全一致。
    #
    # 【注意】当 tools 为空列表时，不能调用 llm.bind_tools([])，
    # 否则底层 OpenAI 兼容 API 会报错："[] is too short - 'tools'"
    #
    # 【关键修复】LangGraph 的节点输出必须是对状态的更新（dict）。
    # 裸 AIMessage 不会被自动写入 "messages" 通道，导致 checkpoint 中消息丢失。
    # 因此需要在 Runnable 管道末尾加 RunnableLambda，把 AIMessage 包装成 {"messages": [msg]}。
    prompt_template = ChatPromptTemplate.from_messages(
        [
            ("system", prompt_text),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )
    _wrap_message = RunnableLambda(lambda msg: {"messages": [msg]})
    if tools:
        agent_runnable = prompt_template | llm.bind_tools(tools) | _wrap_message
    else:
        agent_runnable = prompt_template | llm | _wrap_message

    # 5. 构图：添加节点 + 连边
    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_runnable)  # LLM 思考节点
    builder.set_entry_point("agent")

    if tools:
        # 有工具时才添加 tools 节点和条件边
        # ToolNode 会自动并行执行 AIMessage.tool_calls 中的所有工具调用，
        # 并返回对应的 ToolMessage 列表。
        tool_node = ToolNode(tools)
        builder.add_node("tools", tool_node)
        builder.add_conditional_edges(
            "agent",
            should_continue,
            {"tools": "tools", END: END},
        )
        builder.add_edge("tools", "agent")  # 工具执行完后回到 agent 继续思考
    else:
        # 没有可用工具时，agent 节点输出后直接结束
        builder.add_edge("agent", END)

    # 6. 编译，附加 checkpoint（对话记忆持久化）
    return builder.compile(checkpointer=get_saver())


def _get_graph(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str = ""):
    """获取或编译 Graph 实例（按参数缓存，避免重复创建）。"""
    key = (user_id, enable_knowledge, enable_search, system_prompt)
    if key not in _graph_cache:
        print(f"[AGENT] 创建新 Graph: key={key}")
        _graph_cache[key] = _build_graph(user_id=user_id, enable_knowledge=enable_knowledge, enable_search=enable_search, system_prompt=system_prompt)
    else:
        print(f"[AGENT] 命中缓存 Graph: key={key}")
    return _graph_cache[key]


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
    print(
        f"[AGENT] stream_agent 参数: enable_knowledge={enable_knowledge}, "
        f"enable_search={enable_search}, user_id={user_id}"
    )

    # 1. 获取缓存的 Graph 实例
    graph = _get_graph(user_id=user_id, enable_knowledge=enable_knowledge, enable_search=enable_search, system_prompt=memory_context)

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

    # 3. 遍历 Graph 输出
    #
    # 【与 create_react_agent 的流式输出对比】
    # 二者都使用 stream_mode="messages"，调用方式和遍历逻辑完全一致。
    # 区别只在于 metadata 中的节点名：create_react_agent 内部节点叫 "agent" 或 "model"；
    # StateGraph 的节点名就是你 add_node 时指定的名字（这里也是 "agent"）。
    # 因此下面的过滤逻辑不需要改动。
    config = {"configurable": {"thread_id": thread_id}}
    has_content = False

    for msg, metadata in graph.stream(
        {"messages": messages}, config, stream_mode="messages"
    ):
        msg_type = getattr(msg, "type", "")
        tool_calls = getattr(msg, "tool_calls", None)

        # 跳过 ToolMessage（tools 节点的输出）
        if msg_type == "tool":
            continue

        # 跳过带有有效工具调用的 AIMessage（不暴露工具调用过程给用户）
        # 只跳过 name 非空的 tool_calls；空列表或 name 为空的不会误过滤
        if tool_calls and any(tc.get("name") for tc in tool_calls if tc):
            continue

        token = getattr(msg, "content", "")
        if token:
            has_content = True
            yield _sse_json({"content": sanitize_response(str(token))})
            await asyncio.sleep(0.01)

    # 4. 兜底：如果模型没有生成任何内容，返回友好提示
    if not has_content:
        yield _sse_json({"content": "抱歉，我暂时无法回答这个问题，请稍后重试。"})

    # 5. 完成
    yield _sse_json({"done": True})

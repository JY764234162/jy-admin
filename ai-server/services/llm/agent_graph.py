"""Agent 深度思考的 LangGraph create_react_agent。

用 Checkpoint 自动管理 Agent 执行状态和消息历史，替代 legacy create_agent。
"""

import asyncio
import json
from typing import AsyncIterator

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from services.storage.checkpoint_store import get_saver, get_async_saver, get_thread_messages
from services.tools.image_tools import image_understand_tool
from services.tools.knowledge_tools import make_search_knowledge_tool
from .llm import llm

AGENT_SYSTEM_PROMPT = """你是一个智能助手，擅长通过调用工具来解决问题。

在回答用户问题之前，请先分析是否需要调用工具。如果需要，请按以下步骤执行：
1. 分析用户需求，确定需要调用哪些工具
2. 调用工具获取信息
3. 基于工具返回的结果进行推理
4. 给出完整、准确的回答，并在引用知识库内容时标注来源

可用的工具包括：
- search_knowledge: 搜索知识库，获取已上传文档中的相关信息。当用户询问文档内容、需要查询特定知识或验证某个事实时，请调用此工具。搜索结果会附带来源文件名，请在回答中引用。
- calculator: 计算数学表达式
- image_understand: 理解图片内容，当用户上传图片或询问图片相关问题时使用

引用规范：当你使用 search_knowledge 获取到资料时，请在回答末尾或相关段落标注引用来源，格式为【来源：文件名】。

请用中文思考和回答。"""


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _make_process_with_steps(steps: list[dict]) -> dict:
    """从步骤列表构造兼容 studio.kxsz.net 的 process 数据结构。"""
    return {
        "plan": {
            "status": "successful",
            "message": ""
        },
        "step": {
            "status": "successful",
            "processes": steps,
            "source": [],
        },
        "task_status": "successful",
    }


def make_tools(user_id: str = "", doc_ids: str = "", enable_knowledge: bool = True):
    """创建已绑定 user_id 和 doc_ids 的工具列表。

    Args:
        enable_knowledge: 是否启用知识库搜索工具（由前端是否勾选知识库决定）
    """
    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id, doc_ids=doc_ids)
        tools.append(search_knowledge)

    @tool
    def calculator(expression: str) -> str:
        """计算数学表达式，返回计算结果。

        当你需要进行数学计算时，请使用此工具。
        支持的运算符：+ - * / ** % // ( ) 以及常见数学函数。
        示例输入："2 + 3 * 4"、"(100 - 25) / 5"、"2 ** 10"
        """
        safe_names = {
            "abs": abs,
            "max": max,
            "min": min,
            "pow": pow,
            "round": round,
            "sum": sum,
        }
        try:
            result = eval(expression, {"__builtins__": {}}, safe_names)
            return str(result)
        except Exception as e:
            return f"计算错误：{str(e)}，请检查表达式格式。"

    tools.append(calculator)
    tools.append(image_understand_tool)
    return tools


def build_agent_graph(
    system_prompt: str = "",
    user_id: str = "",
    doc_ids: str = "",
    enable_knowledge: bool = True,
    checkpointer=None,
):
    """构建并编译 ReAct Agent 图。"""
    tools = make_tools(user_id=user_id, doc_ids=doc_ids, enable_knowledge=enable_knowledge)
    prompt = system_prompt or AGENT_SYSTEM_PROMPT
    return create_react_agent(
        llm,
        tools=tools,
        state_modifier=prompt,
        checkpointer=checkpointer or get_saver(),
    )


async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    doc_ids: str = "",
    enable_knowledge: bool = True,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 决定是否挂载知识库工具。
    捕获 agent / tools 节点输出，实时推送思考过程。
    """
    saver = await get_async_saver()
    graph = build_agent_graph(memory_context, user_id, doc_ids, enable_knowledge, checkpointer=saver)
    config = {"configurable": {"thread_id": thread_id}}

    # 获取历史消息并追加当前输入
    past_messages = get_thread_messages(thread_id)

    # 如果有图片 URL，在消息中嵌入图片信息，便于 Agent 调用 image_understand 工具
    if image_url:
        content = f"用户上传了一张图片，图片地址为: {image_url}\n\n用户的问题是: {message}"
    else:
        content = message

    messages = past_messages + [HumanMessage(content=content)]

    # 初始分析步骤
    yield _sse_json({
        "status":
        "processing",
        "process":
        _make_process_with_steps([{
            "step_id": "analysis",
            "status": "processing",
            "message": "",
            "description": "正在分析问题，准备调用工具...",
        }]),
    })
    await asyncio.sleep(0.08)

    steps: list[dict] = []
    final_output = ""

    async for chunk in graph.astream({"messages": messages},
                                     config,
                                     stream_mode="updates"):
        for node_name, node_output in chunk.items():
            if node_name == "agent":
                for msg in node_output.get("messages", []):
                    tool_calls = getattr(msg, "tool_calls", None)
                    if tool_calls:
                        for tc in tool_calls:
                            tool_name = tc.get("name", "unknown")
                            steps.append({
                                "step_id":
                                tool_name,
                                "status":
                                "processing",
                                "message":
                                "",
                                "description":
                                f"正在调用工具：{tool_name}...",
                            })
                    elif msg.content and not tool_calls:
                        final_output = msg.content

            elif node_name == "tools":
                for msg in node_output.get("messages", []):
                    if getattr(msg, "type", "") == "tool":
                        if steps:
                            steps[-1]["status"] = "successful"
                            steps[-1][
                                "description"] = f"工具返回：{str(msg.content)[:300]}"

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

    yield _sse_json({
        "status": "successful",
        "answer": final_output,
        "process": _make_process_with_steps(steps),
        "done": True,
    })

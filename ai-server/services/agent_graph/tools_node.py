"""工具创建与 ToolNode 包装。

职责：集中管理 Agent 可用工具的创建逻辑，以及带日志/错误处理的 ToolNode 包装。
"""

from langgraph.prebuilt import ToolNode

from services.tools.knowledge_tools import make_list_knowledge_tool, make_search_knowledge_tool
from services.tools.search_tools import make_tavily_search_tool

from .state import AgentState


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


def _make_tool_node(tools: list):
    """创建带日志的 tool 节点（包装 LangGraph ToolNode）。

    在工具执行前后打印日志，方便追踪工具调用链。
    执行后递增 iterations 计数器。
    """
    base = ToolNode(tools)

    def tool_node(state: AgentState) -> dict:
        last_message = state["messages"][-1]
        tool_calls = getattr(last_message, "tool_calls", None) or []
        call_names = [tc.get("name") for tc in tool_calls if tc]
        print(f"[AGENT] ToolNode 开始执行: {call_names}")

        try:
            result = base.invoke(state)
        except Exception as e:
            print(f"[AGENT] ToolNode 执行异常: {e}")
            # 构造 ToolMessage 错误结果，让 agent 节点能继续处理
            from langchain_core.messages import ToolMessage
            error_results = []
            for tc in tool_calls:
                tid = tc.get("id", "unknown")
                tname = tc.get("name", "unknown")
                error_results.append(
                    ToolMessage(
                        content=f"工具执行失败：{str(e)}",
                        name=tname,
                        tool_call_id=tid,
                    )
                )
            # 迭代次数 +1
            new_iterations = state.get("iterations", 0) + 1
            return {"messages": error_results, "iterations": new_iterations}

        for msg in result.get("messages", []):
            name = getattr(msg, "name", "?")
            content = str(getattr(msg, "content", "") or "")[:120]
            status = "✓" if content else "✗"
            print(f"[AGENT] ToolNode 执行完成 [{status}] {name}: {content}...")

        # 迭代次数 +1（一次完整的 think→act→observe 算一次迭代）
        new_iterations = state.get("iterations", 0) + 1
        result["iterations"] = new_iterations
        return result

    return tool_node

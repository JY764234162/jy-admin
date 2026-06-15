"""Search Worker：联网搜索专用 ReAct 循环。

职责：使用 tavilysearch 工具执行联网搜索，
      支持最多 2 次迭代的简单 ReAct 循环，并将结果写入 state["search_results"]。
"""

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

from services.llm.llm import llm

from ..message_helpers import build_assistant_reply_update, messages_for_llm_prompt
from ..prompts import SEARCH_WORKER_PROMPT
from ..state import MAX_RAW_MESSAGES, AgentState
from ..tools_node import make_tools


def _make_search_worker(system_prompt: str, user_id: str, enable_search: bool):
    """创建联网搜索 worker 的工厂。"""

    def search_worker(state: AgentState) -> dict:
        """搜索 worker：使用 tavilysearch 工具执行搜索。"""
        if not enable_search:
            return {
                "messages": [
                    AIMessage(content="联网搜索功能未开启，暂时无法获取实时信息。")
                ]
            }

        messages = state["messages"]
        summary = state.get("summary", "")
        rewrite_query = state.get("rewrite_query", "")

        # 创建工具（只启用搜索）
        tools = make_tools(user_id=user_id, enable_knowledge=False, enable_search=True)
        search_tools = [t for t in tools if t.name == "tavilysearch"]
        if not search_tools:
            return {
                "messages": [
                    AIMessage(content="搜索工具暂不可用，无法执行联网搜索。")
                ]
            }

        # 绑定工具
        llm_with_tools = llm.bind_tools(search_tools)

        # 组装 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(SEARCH_WORKER_PROMPT)
        if rewrite_query:
            parts.append(
                f"## 查询优化建议\n"
                f"为获取更准确的搜索结果，建议以以下语义进行搜索：'{rewrite_query}'\n"
                f"请在调用 tavilysearch 时参考此改写。"
            )
        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        recent_messages = messages_for_llm_prompt(messages, limit=MAX_RAW_MESSAGES)
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        # 简单 ReAct 循环，最多 2 次迭代
        max_iterations = 2
        current_iteration = 0
        response = None
        all_tool_results = []

        while current_iteration < max_iterations:
            current_iteration += 1
            try:
                response = llm_with_tools.invoke(prompt_messages)
            except Exception as e:
                print(f"[AGENT] 搜索 worker LLM 调用异常: {e}")
                response = AIMessage(content="抱歉，执行搜索时遇到异常，请稍后重试。")
                break

            tool_calls = getattr(response, "tool_calls", None) or []
            if not tool_calls:
                # 没有工具调用，直接返回
                break

            # 执行工具调用
            tool_messages = []
            for tool_call in tool_calls:
                tool_name = tool_call.get("name", "")
                tool_args = tool_call.get("args", {})
                tool_id = tool_call.get("id", "unknown")

                print(f"[AGENT] 搜索 worker 调用工具: {tool_name}")

                tool_result = None
                for tool in search_tools:
                    if tool.name == tool_name:
                        try:
                            tool_result = tool.invoke(tool_args)
                        except Exception as e:
                            tool_result = f"工具执行失败：{str(e)}"
                        break

                if tool_result is None:
                    tool_result = f"未找到工具: {tool_name}"

                all_tool_results.append(f"[{tool_name}] {tool_result}")
                tool_messages.append(
                    ToolMessage(content=str(tool_result), name=tool_name, tool_call_id=tool_id)
                )

            # 追加到 prompt_messages 继续循环
            prompt_messages = prompt_messages + [response] + tool_messages

        # 如果没有得到最终响应，生成兜底回复
        if response is None:
            response = AIMessage(content="抱歉，搜索未能完成，请稍后重试。")

        # 提取最终回复文本
        final_content = response.content if hasattr(response, "content") else str(response)
        if not final_content and all_tool_results:
            final_content = "\n".join(all_tool_results)

        # 写入 search_results
        search_results_text = "\n".join(all_tool_results) if all_tool_results else final_content

        # 构建最终响应
        if not getattr(response, "content", None) and all_tool_results:
            response = AIMessage(content=search_results_text)

        print(f"[AGENT] 搜索 worker 完成: {len(search_results_text)} 字结果")

        update = build_assistant_reply_update(messages, response)
        update["search_results"] = search_results_text
        return update

    return search_worker

"""Search Worker：联网搜索专用 ReAct 循环。

职责：使用 tavilysearch 工具执行联网搜索，
      支持最多 2 次迭代的简单 ReAct 循环，并将结果写入 state["search_results"]。
"""

import logging

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from services.llm.llm import llm

from ..message_helpers import build_assistant_reply_update, format_current_datetime_context, messages_for_llm_prompt
from ..prompts import SEARCH_WORKER_PROMPT
from ..state import MAX_RAW_MESSAGES, AgentState
from .utils import run_single_tool_loop

logger = logging.getLogger(__name__)


def _make_search_worker(system_prompt: str, tools: list, enable_search: bool):
    """创建联网搜索 worker 的工厂。"""

    def search_worker(state: AgentState, config: RunnableConfig | None = None) -> dict:
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

        # 从传入的 tools 中筛选搜索工具
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
        parts.append(format_current_datetime_context())
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

        # 使用共享 ReAct 循环
        response, tool_results_text = run_single_tool_loop(
            llm_with_tools=llm_with_tools,
            prompt_messages=prompt_messages,
            selected_tools=search_tools,
            max_iterations=2,
            config=config,
        )

        # 优先使用原始工具结果文本
        search_results_text = tool_results_text or (
            response.content if hasattr(response, "content") else str(response)
        )

        logger.info("搜索 worker 完成: %s 字结果", len(search_results_text))

        update = build_assistant_reply_update(messages, response)
        update["search_results"] = search_results_text
        return update

    return search_worker

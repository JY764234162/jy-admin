"""Direct Worker：单意图直接执行，按需绑定单一工具。

职责：根据 primary_intent 判断使用哪种工具，只绑定所需工具，
      执行一次工具调用后返回最终回复。
"""

import logging

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

from services.llm.llm import llm

from ..message_helpers import build_assistant_reply_update, messages_for_llm_prompt
from ..prompts import DIRECT_WORKER_PROMPT
from ..state import MAX_RAW_MESSAGES, AgentState
from ..tracing import get_runnable_config

logger = logging.getLogger(__name__)


def _make_direct_worker(
    system_prompt: str, tools: list, enable_knowledge: bool, enable_search: bool
):
    """创建直接执行 worker 的工厂。

    根据 state["primary_intent"] 决定使用哪种工具：
      - knowledge → 仅绑定知识库工具
      - search → 仅绑定搜索工具
      - other / fallback → 不绑定工具，直接回复
    """

    def direct_worker(state: AgentState) -> dict:
        """直接执行 worker：根据意图选择单一工具并执行。"""
        messages = state["messages"]
        summary = state.get("summary", "")
        rewrite_query = state.get("rewrite_query", "")
        primary_intent = state.get("primary_intent", "other")

        # 根据意图筛选工具
        selected_tools = []
        if primary_intent == "knowledge" and enable_knowledge:
            selected_tools = [t for t in tools if t.name in ("search_knowledge", "list_knowledge")]
        elif primary_intent == "search" and enable_search:
            selected_tools = [t for t in tools if t.name == "tavilysearch"]

        # 组装 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(DIRECT_WORKER_PROMPT)
        if rewrite_query:
            parts.append(
                f"## 查询优化建议\n"
                f"为获取更准确的检索结果，建议以以下语义进行搜索：'{rewrite_query}'\n"
                f"请在调用工具时参考此改写。"
            )
        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        recent_messages = messages_for_llm_prompt(messages, limit=MAX_RAW_MESSAGES)
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        # 绑定工具（如果有）
        llm_with_tools = llm.bind_tools(selected_tools) if selected_tools else None

        try:
            if llm_with_tools:
                response = llm_with_tools.invoke(prompt_messages, config=get_runnable_config())
            else:
                response = llm.invoke(prompt_messages, config=get_runnable_config())
        except Exception:
            logger.error("直接 worker LLM 调用异常", exc_info=True)
            response = AIMessage(content="抱歉，服务暂时异常，请稍后重试。")
            return build_assistant_reply_update(messages, response)

        # 检查是否有工具调用
        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            logger.info("直接 worker 未调用工具，直接生成回复")
            return build_assistant_reply_update(messages, response)

        # 执行工具调用（只执行第一个）
        if len(tool_calls) > 1:
            logger.warning(
                "直接 worker 收到 %d 个 tool_calls，仅执行第一个", len(tool_calls)
            )

        tool_call = tool_calls[0]
        tool_name = tool_call.get("name", "")
        tool_args = tool_call.get("args", {})
        tool_id = tool_call.get("id", "unknown")

        logger.info("直接 worker 调用工具: %s", tool_name)

        # 找到对应的工具并执行
        tool_result = None
        for tool in selected_tools:
            if tool.name == tool_name:
                try:
                    tool_result = tool.invoke(tool_args)
                except Exception:
                    logger.error("工具执行失败: %s", tool_name, exc_info=True)
                    tool_result = f"工具执行失败：{tool_name}"
                break

        if tool_result is None:
            tool_result = f"未找到工具: {tool_name}"

        # 构造 ToolMessage 并追加到消息列表
        tool_message = ToolMessage(content=str(tool_result), name=tool_name, tool_call_id=tool_id)
        prompt_messages_with_result = prompt_messages + [response, tool_message]

        # 最终 LLM 调用，生成带工具结果的回复
        try:
            if llm_with_tools:
                final_response = llm_with_tools.invoke(prompt_messages_with_result, config=get_runnable_config())
            else:
                final_response = llm.invoke(prompt_messages_with_result, config=get_runnable_config())
        except Exception:
            logger.error("直接 worker 最终调用异常", exc_info=True)
            final_response = AIMessage(content="抱歉，处理工具结果时遇到异常，请稍后重试。")

        # 如果最终响应仍然包含工具调用，直接返回文本回复
        final_tool_calls = getattr(final_response, "tool_calls", None) or []
        if final_tool_calls:
            # 强制返回纯文本，避免循环
            final_response = AIMessage(content=str(tool_result))

        logger.info("直接 worker 完成: %s 字", len(final_response.content))
        return build_assistant_reply_update(messages, final_response)

    return direct_worker

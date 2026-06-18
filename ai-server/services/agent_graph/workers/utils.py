"""Worker utilities: shared ReAct loop helper."""

import logging
from typing import Optional

from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)


def run_single_tool_loop(
    llm_with_tools,
    prompt_messages: list,
    selected_tools: list,
    max_iterations: int = 2,
    config: RunnableConfig | None = None,
) -> tuple[AIMessage, str]:
    """Run a simple ReAct loop: LLM -> first tool call -> LLM with result.

    Args:
        llm_with_tools: LLM instance already bound with tools.
        prompt_messages: Initial prompt messages (system + user).
        selected_tools: List of actual tool callables to execute.
        max_iterations: Maximum loop iterations (default 2).
        config: Optional RunnableConfig, used to propagate streaming callbacks.

    Returns:
        Tuple of (final AIMessage, concatenated raw tool results text).
    """
    all_tool_results = []
    response: Optional[AIMessage] = None

    for iteration in range(max_iterations):
        try:
            response = llm_with_tools.invoke(prompt_messages, config=config)
        except Exception:
            logger.error("LLM invoke error in tool loop", exc_info=True)
            return AIMessage(content="抱歉，调用模型时遇到异常，请稍后重试。"), ""

        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            break

        # Execute only the first tool call
        tool_call = tool_calls[0]
        tool_name = tool_call.get("name", "")
        tool_args = tool_call.get("args", {})
        tool_id = tool_call.get("id", "unknown")

        logger.info("Executing tool: %s", tool_name)

        tool_result = None
        for tool in selected_tools:
            if tool.name == tool_name:
                try:
                    tool_result = tool.invoke(tool_args, config=config)
                except Exception:
                    logger.error("Tool execution failed: %s", tool_name, exc_info=True)
                    tool_result = f"工具执行失败：{tool_name}"
                break

        if tool_result is None:
            tool_result = f"未找到工具: {tool_name}"

        all_tool_results.append(f"[{tool_name}] {tool_result}")
        tool_message = ToolMessage(
            content=str(tool_result), name=tool_name, tool_call_id=tool_id
        )
        prompt_messages = prompt_messages + [response, tool_message]

    if response is None:
        return AIMessage(content="抱歉，处理未能完成，请稍后重试。"), ""

    tool_results_text = "\n".join(all_tool_results)

    # If response has no content but we have tool results, synthesize content
    final_content = response.content if hasattr(response, "content") else str(response)
    if not final_content and all_tool_results:
        final_content = tool_results_text

    # Ensure we always return an AIMessage with the final content
    if not getattr(response, "content", None) and all_tool_results:
        response = AIMessage(content=final_content)

    return response, tool_results_text

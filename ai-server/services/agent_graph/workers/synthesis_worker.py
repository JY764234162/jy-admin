"""Synthesis Worker：结果综合与最终回复生成。

职责：读取 knowledge_results、search_results 和 step_results，
      生成整合所有可用结果的最终回复，处理结果冲突。
"""

import logging

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from services.llm.llm import llm

from ..message_helpers import build_assistant_reply_update, format_current_datetime_context, messages_for_llm_prompt
from ..prompts import SYNTHESIS_WORKER_PROMPT
from ..state import MAX_RAW_MESSAGES, AgentState
from ..tracing import get_runnable_config

logger = logging.getLogger(__name__)


def _make_synthesis_worker(system_prompt: str = ""):
    """创建综合 worker 的工厂。

    读取 state 中的各类结果，生成整合后的最终回复。
    """

    def synthesis_worker(state: AgentState, config: RunnableConfig | None = None) -> dict:
        """综合 worker：整合所有结果生成最终回复。"""
        messages = state["messages"]
        summary = state.get("summary", "")
        knowledge_results = state.get("knowledge_results", "")
        search_results = state.get("search_results", "")
        step_results = state.get("step_results", [])

        # 组装 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(format_current_datetime_context())
        parts.append(SYNTHESIS_WORKER_PROMPT)

        # 注入可用结果
        result_sections = []
        if knowledge_results:
            result_sections.append(f"## 知识库检索结果\n{knowledge_results}")
        if search_results:
            result_sections.append(f"## 联网搜索结果\n{search_results}")
        if step_results:
            step_outputs = []
            for sr in step_results:
                if hasattr(sr, "output"):
                    step_outputs.append(f"- [{sr.worker}] {sr.output}")
                elif isinstance(sr, dict):
                    step_outputs.append(f"- [{sr.get('worker', 'unknown')}] {sr.get('output', '')}")
            if step_outputs:
                result_sections.append(f"## 计划执行结果\n" + "\n".join(step_outputs))

        if result_sections:
            parts.append("\n\n".join(result_sections))
        else:
            parts.append("## 可用结果\n（暂无知识库或搜索结果）")

        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        recent_messages = messages_for_llm_prompt(messages, limit=MAX_RAW_MESSAGES)
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        try:
            response = llm.invoke(prompt_messages, config=get_runnable_config(config))
        except Exception:
            logger.error("综合 worker 异常", exc_info=True)
            response = AIMessage(content="抱歉，整合结果时遇到异常，请稍后重试。")

        logger.info("综合 worker 生成回复: %s 字", len(response.content))
        return build_assistant_reply_update(messages, response)

    return synthesis_worker

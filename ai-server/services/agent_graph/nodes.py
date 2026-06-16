"""所有 LangGraph 节点函数。

职责：实现 Graph 中每个节点的具体逻辑，包括：
      - 摘要生成（summarize_node + _generate_summary）
      - 占位 AI 追加（ensure_placeholder_node）
"""

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from services.llm.llm import summary_llm

from .prompts import SUMMARY_SYSTEM_PROMPT
from .message_helpers import (
    build_assistant_reply_update,
    extract_json_from_text,
    extract_text_content,
    is_placeholder_assistant,
    last_human_message,
    stamp_message_created_at,
)
from .state import MAX_RAW_MESSAGES, AgentState


# ========== 占位 AI 节点 ==========


def ensure_placeholder_node(state: AgentState) -> dict:
    """分析完成后、生成前追加占位 AI（列表可见 loading 条）。"""
    messages = state.get("messages") or []
    if not messages:
        return {}
    if getattr(messages[-1], "type", "") == "human":
        return {"messages": [stamp_message_created_at(AIMessage(content=""))]}
    if is_placeholder_assistant(messages[-1]):
        return {}
    return {}


# ========== 状态清理节点 ==========


def cleanup_node(state: AgentState) -> dict:
    """清理节点：每轮结束后清除中间状态，保留跨轮持久字段。

    清除的字段（中间状态）：
      - plan, current_step_index, step_results
      - knowledge_results, search_results, synthesis_context
      - quality_passed, quality_feedback
      - intents, primary_intent, intent_confidence
      - task_complexity, suggested_plan

    保留的字段（持久状态）：
      - messages, summary, intent, iterations, rewrite_query
    """
    return {
        "plan": [],
        "current_step_index": 0,
        "step_results": [],
        "knowledge_results": "",
        "search_results": "",
        "synthesis_context": "",
        "quality_passed": False,
        "quality_feedback": "",
        "intents": [],
        "primary_intent": "",
        "intent_confidence": 0.0,
        "task_complexity": "simple",
        "suggested_plan": [],
    }


# ========== 摘要节点 ==========


def summarize_node(state: AgentState) -> dict:
    """摘要节点：对超出的历史消息生成摘要。

    触发条件：checkpoint 中的 messages 数量超过 MAX_RAW_MESSAGES
    行为：
      - 取较早的消息生成摘要
      - 与已有摘要合并（增量更新）
      - 更新 state.summary 字段
    注意：不删除原始消息，checkpoint 保留完整历史；
          上下文截断在 agent 节点中通过滑动窗口实现。
    """
    messages = state["messages"]
    existing_summary = state.get("summary", "")

    # 需要被摘要的消息（除最近 N 条外的所有）
    to_summarize = messages[:-MAX_RAW_MESSAGES]

    # 生成新摘要
    summary = _generate_summary(to_summarize, existing_summary)

    print(f"[AGENT] 生成摘要: {len(to_summarize)} 条消息 → {len(summary)} 字摘要")

    # 只更新 summary 字段，messages 保持不变
    return {"summary": summary}


def _generate_summary(messages: list, existing_summary: str = "") -> str:
    """调用 LLM 生成对话摘要。

    Args:
        messages: 需要被摘要的原始消息列表（较早的对话）
        existing_summary: 已有的历史摘要（增量更新时使用）

    Returns:
        生成的摘要文本
    """
    # 将消息格式化为易读的对话文本
    dialog_lines = []
    for msg in messages:
        if not hasattr(msg, "content") or not msg.content:
            continue
        role = "用户" if msg.type == "human" else "助手"
        # 截断过长的单条消息，避免摘要 prompt 过大
        content = str(msg.content)[:500]
        dialog_lines.append(f"{role}: {content}")

    dialog_text = "\n".join(dialog_lines)

    # 构建摘要请求 prompt
    prompt_parts = [SUMMARY_SYSTEM_PROMPT]
    if existing_summary:
        prompt_parts.append(f"\n【已有摘要】\n{existing_summary}")
    prompt_parts.append(f"\n【新增对话】\n{dialog_text}\n\n【更新后的完整摘要】")

    prompt = "\n".join(prompt_parts)

    # 调用非流式 LLM 生成摘要
    response = summary_llm.invoke(
        [HumanMessage(content=prompt)],
        config=RunnableConfig(callbacks=[]),
    )
    return response.content.strip()

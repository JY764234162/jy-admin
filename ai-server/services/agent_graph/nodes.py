"""所有 LangGraph 节点函数。

职责：实现 Graph 中每个节点的具体逻辑，包括：
      - 意图识别（intent_node）
      - 查询改写（query_rewrite_node）
      - 摘要生成（summarize_node + _generate_summary）
      - 占位 AI 追加（ensure_placeholder_node）
"""

import json
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.llm.llm import llm, summary_llm

from .prompts import (
    ANALYZE_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
)
from .message_helpers import (
    build_assistant_reply_update,
    extract_json_from_text,
    extract_text_content,
    is_placeholder_assistant,
    last_human_message,
    stamp_message_created_at,
)
from .state import MAX_RAW_MESSAGES, AgentState


# ========== Pydantic 结构化输出模型 ==========

class AnalyzeResult(BaseModel):
    """分析节点输出：意图标签 + 查询改写"""
    intent: str = Field(
        description="用户意图：chat(闲聊) / knowledge(知识库) / search(联网搜索) / mixed(混合) / other(其他)",
    )
    rewrite_query: str = Field(
        default="",
        description="改写后的检索查询（仅 knowledge/mixed 时有效，其他情况为空字符串）",
    )


# ========== 意图识别 + 查询改写合并节点 ==========


def _extract_input_value_from_error(error_text: str) -> str:
    """从 LangChain structured_output 异常文本中提取 input_value。"""
    # 匹配 input_value='...' 或 input_value="..."（可能跨多行）
    match = re.search(r'''input_value=(["'])([\s\S]*?)\1''', error_text, re.DOTALL)
    if match:
        raw = match.group(2)
        # 处理 Python repr 中的转义字符
        raw = raw.replace("\\n", "\n").replace("\\t", "\t").replace("\\'", "'").replace('\\"', '"')
        return raw
    return ""


def analyze_node(state: AgentState) -> dict:
    """分析节点：一次 LLM 调用同时完成意图识别 + 查询改写。

    把原本串行的两次 LLM 调用（intent_node + query_rewrite_node）合并为一次，
    显著缩短首 token 时间（TTFT）。

    返回：
      - intent: chat/knowledge/search/mixed/other
      - rewrite_query: 优化后的检索查询（knowledge/mixed 时有效）
      - iterations: 0（重置迭代计数器）
    """
    messages = state["messages"]
    if not messages:
        return {"intent": "other", "rewrite_query": "", "iterations": 0}

    last_message = last_human_message(messages) or messages[-1]
    content = extract_text_content(last_message)
    if not content:
        return {"intent": "other", "rewrite_query": "", "iterations": 0}

    prompt = (
        f"{ANALYZE_SYSTEM_PROMPT}\n\n"
        f"请严格返回以下 JSON 格式，不要添加 markdown 代码块或其他说明：\n"
        f'{{"intent": "chat|knowledge|search|mixed|other", "rewrite_query": "改写后的查询或空字符串"}}\n\n'
        f"用户消息：{content}"
    )

    try:
        raw_response = llm.invoke(
            [HumanMessage(content=prompt)],
            config=RunnableConfig(callbacks=[]),
        )
        resp_text = str(raw_response.content) if raw_response.content else ""
        json_text = extract_json_from_text(resp_text)

        if not json_text:
            raise ValueError(f"无法从 LLM 响应中提取 JSON: {resp_text[:200]}")

        parsed = json.loads(json_text)
        result = AnalyzeResult.model_validate(parsed)
        intent = result.intent.strip().lower()
        rewrite_query = result.rewrite_query.strip()
        print(f"[AGENT] 分析成功: intent={intent}")
    except Exception as e:
        print(f"[AGENT] 分析异常，回退到 other: {e}")
        intent = "other"
        rewrite_query = ""

    # 验证并规范化
    valid_intents = {"chat", "knowledge", "search", "mixed", "other"}
    intent = intent if intent in valid_intents else "other"

    print(f"[AGENT] 分析结果: intent={intent}, rewrite='{rewrite_query[:30]}...'")
    return {"intent": intent, "rewrite_query": rewrite_query, "iterations": 0}


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

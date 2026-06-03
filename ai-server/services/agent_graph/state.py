"""LangGraph 状态定义与运行时常量。"""

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


# 保留的原始消息条数（超过后触发摘要）
# 按对话轮数估算：一轮 ≈ 2 条（user + AI），10 条 ≈ 5 轮
MAX_RAW_MESSAGES = 10

# 单轮对话中 agent→tools→agent 的最大循环次数（防止无限循环和费用失控）
MAX_ITERATIONS = 5


class AgentState(TypedDict):
    """LangGraph 显式状态定义。

    字段说明：
      messages:       对话消息列表（含完整历史）。使用 add_messages reducer。
      summary:        对早期对话的文本摘要。
      intent:         当前用户消息的意图标签（chat/knowledge/search/mixed/other）。
      iterations:     当前轮次中 agent→tools→agent 的循环次数（防止无限循环）。
      rewrite_query:  查询改写节点生成的优化查询（用于 RAG）。
    """
    messages: Annotated[list, add_messages]
    summary: str
    intent: str
    iterations: int
    rewrite_query: str

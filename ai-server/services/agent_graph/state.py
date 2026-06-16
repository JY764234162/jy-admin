"""LangGraph 状态定义与运行时常量。"""

from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


# 保留的原始消息条数（超过后触发摘要）
# 按对话轮数估算：一轮 ≈ 2 条（user + AI），10 条 ≈ 5 轮
MAX_RAW_MESSAGES = 10

# 单轮对话中 agent→tools→agent 的最大循环次数（防止无限循环和费用失控）
MAX_ITERATIONS = 5


class IntentItem(BaseModel):
    """意图识别结果项。"""

    intent: str
    confidence: float
    reasoning: str
    suggested_worker: str


class PlanStep(BaseModel):
    """计划执行步骤。"""

    step_id: str
    worker: str
    input_query: str
    depends_on: list[str] = Field(default_factory=list)
    expected_output: str


class StepResult(BaseModel):
    """步骤执行结果。"""

    step_id: str
    worker: str
    output: str
    status: Literal["pending", "running", "success", "failed"]


class AgentState(TypedDict):
    """LangGraph 显式状态定义。

    字段说明：
      messages:       对话消息列表（含完整历史）。使用 add_messages reducer。
      summary:        对早期对话的文本摘要。
      intent:         当前用户消息的意图标签（chat/knowledge/search/mixed/other）。
      iterations:     当前轮次中 agent→tools→agent 的循环次数（防止无限循环）。
      rewrite_query:  查询改写节点生成的优化查询（用于 RAG）。
      intents:        多意图识别结果列表。
      primary_intent: 主意图标签。
      intent_confidence: 主意图置信度。
      plan:           执行计划步骤列表。
      current_step_index: 当前执行步骤索引。
      step_results:   步骤执行结果列表。
      plan_refinement_count: 计划重 refinement 次数。
      knowledge_results: 知识库检索结果。
      search_results: 网络搜索结果。
      synthesis_context: 综合上下文。
      quality_passed: 质量检查是否通过。
      quality_feedback: 质量检查反馈。
      task_complexity: 任务复杂度评估（simple/complex）。
      suggested_plan: Supervisor 建议的计划步骤列表。
    """
    messages: Annotated[list, add_messages]
    summary: str
    intent: str
    iterations: int
    rewrite_query: str
    intents: list[IntentItem]
    primary_intent: str
    intent_confidence: float
    plan: list[PlanStep]
    current_step_index: int
    step_results: list[StepResult]
    plan_refinement_count: int
    knowledge_results: str
    search_results: str
    synthesis_context: str
    quality_passed: bool
    quality_feedback: str
    task_complexity: str
    suggested_plan: list[str]

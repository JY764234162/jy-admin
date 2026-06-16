"""Plan-and-Execute Planner Node.

职责：根据 Supervisor 输出的意图、复杂度、建议计划，调用 LLM 生成结构化执行计划。
"""

import json
import logging
from typing import Optional

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from services.llm.llm import llm

from ..message_helpers import extract_json_from_text, extract_text_content, last_human_message
from ..prompts import PLANNER_SYSTEM_PROMPT
from ..state import AgentState, PlanStep
from ..tracing import get_runnable_config

logger = logging.getLogger(__name__)


class PlanResult(BaseModel):
    """结构化计划输出模型。"""

    plan: list[PlanStep] = Field(
        default_factory=list,
        description="执行计划步骤列表",
    )


def _build_fallback_plan(user_query: str, primary_intent: str = "other") -> list[PlanStep]:
    """构建兜底计划：根据主意图路由到对应 worker。"""
    intent_to_worker = {
        "chat": "chat_worker",
        "knowledge": "knowledge_worker",
        "search": "search_worker",
    }
    worker = intent_to_worker.get(primary_intent, "synthesis_worker")
    return [
        PlanStep(
            step_id="step_1",
            worker=worker,
            input_query=user_query,
            depends_on=[],
            expected_output="直接回答用户问题",
        )
    ]


def planner_node(state: AgentState) -> dict:
    """Planner 节点：生成结构化执行计划。

    1. 读取 state["intents"], state["primary_intent"], state["task_complexity"], state["suggested_plan"]。
    2. 获取最后一条人类消息文本。
    3. 调用 LLM 生成结构化计划（PlanResult）。
    4. 返回包含 plan、current_step_index、step_results 的字典。

    解析失败或 LLM 异常时回退到单步 synthesis_worker 兜底计划。
    """
    messages = state["messages"]
    primary_intent = state.get("primary_intent", "other")
    if not messages:
        return {
            "plan": _build_fallback_plan("", primary_intent),
            "current_step_index": 0,
            "step_results": [],
        }

    last_message = last_human_message(messages) or messages[-1]
    content = extract_text_content(last_message)
    if not content:
        return {
            "plan": _build_fallback_plan("", primary_intent),
            "current_step_index": 0,
            "step_results": [],
        }

    # 读取 Supervisor 输出
    intents = state.get("intents", [])
    primary_intent = state.get("primary_intent", "other")
    task_complexity = state.get("task_complexity", "simple")
    suggested_plan = state.get("suggested_plan", [])

    # 构建 prompt
    suggested_plan_text = "\n".join(
        f"- {item}" for item in suggested_plan
    ) if suggested_plan else "（无建议计划）"

    prompt = (
        f"{PLANNER_SYSTEM_PROMPT}\n\n"
        f"## 任务上下文\n"
        f"- 主意图：{primary_intent}\n"
        f"- 复杂度：{task_complexity}\n"
        f"- 建议计划：\n{suggested_plan_text}\n\n"
        f"## 用户消息\n{content}\n\n"
        f"请严格返回 JSON 格式，不要添加 markdown 代码块或其他说明。"
    )

    plan_steps: list[PlanStep] = []

    try:
        # 优先尝试结构化输出
        structured_llm = llm.with_structured_output(PlanResult)
        raw_response = structured_llm.invoke([HumanMessage(content=prompt)], config=get_runnable_config())

        if raw_response and hasattr(raw_response, "plan") and raw_response.plan:
            plan_steps = raw_response.plan
        else:
            raise ValueError("结构化输出返回空计划")

    except Exception as e:
        logger.warning(f"[PLANNER] 结构化输出失败，尝试 JSON 解析: {e}")

        try:
            raw_response = llm.invoke([HumanMessage(content=prompt)], config=get_runnable_config())
            resp_text = str(raw_response.content) if hasattr(raw_response, "content") else str(raw_response)
            json_text = extract_json_from_text(resp_text)

            if not json_text:
                raise ValueError(f"无法从 LLM 响应中提取 JSON: {resp_text[:200]}")

            parsed = json.loads(json_text)
            plan_result = PlanResult.model_validate(parsed)
            plan_steps = plan_result.plan

        except Exception as e2:
            logger.error(f"[PLANNER] 计划生成失败，使用兜底计划: {e2}")
            plan_steps = _build_fallback_plan(content, primary_intent)

    # 校验 plan_steps 非空
    if not plan_steps:
        plan_steps = _build_fallback_plan(content, primary_intent)

    logger.info(
        "[PLANNER] 生成计划: %s 步",
        len(plan_steps),
        extra={"node": "planner_node", "plan_step_count": len(plan_steps)},
    )
    for step in plan_steps:
        logger.info(f"  - {step.step_id}: {step.worker} (depends_on={step.depends_on})")

    return {
        "plan": plan_steps,
        "current_step_index": 0,
        "step_results": [],
    }

"""Quality check and plan refinement nodes.

职责：
- quality_check_node: 评估最终回复是否完整回答用户问题
- plan_refinement_node: 根据质量反馈修订执行计划
"""

import json

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from services.llm.llm import llm

from ..message_helpers import extract_json_from_text, extract_text_content, last_human_message
from ..prompts import QUALITY_CHECK_PROMPT, PLAN_REFINEMENT_PROMPT
from ..state import AgentState, PlanStep


class QualityCheckResult(BaseModel):
    """质量检查结构化输出模型。"""

    passed: bool = Field(
        description="质量检查是否通过：True 表示回复完整回答了用户问题，False 表示未通过",
    )
    feedback: str = Field(
        default="",
        description="如果未通过，给出具体原因和改进建议；通过时为空字符串",
    )


class _PlanRefinementResult(BaseModel):
    """计划重 refinement 结构化输出模型。"""

    plan: list[PlanStep] = Field(
        default_factory=list,
        description="修订后的执行计划步骤列表",
    )


END = "__end__"


def quality_check_node(state: AgentState) -> dict:
    """质量检查节点：评估最终回复是否完整回答用户问题。

    1. 读取最后一条 assistant 消息（综合结果）和原始用户查询。
    2. 调用 LLM 进行结构化质量评估。
    3. 返回 quality_passed 和 quality_feedback。

    解析失败或 LLM 异常时回退到 quality_passed=True（不阻塞流程）。
    """
    messages = state["messages"]
    if not messages:
        return {"quality_passed": True, "quality_feedback": ""}

    last_human = last_human_message(messages)
    if not last_human:
        return {"quality_passed": True, "quality_feedback": ""}

    user_query = extract_text_content(last_human)

    # 找到最后一条 assistant 消息
    last_assistant = None
    for msg in reversed(messages):
        if getattr(msg, "type", "") in ("ai", "assistant"):
            last_assistant = msg
            break

    assistant_reply = extract_text_content(last_assistant) if last_assistant else ""

    prompt = (
        f"{QUALITY_CHECK_PROMPT}\n\n"
        f"请严格返回以下 JSON 格式，不要添加 markdown 代码块或其他说明：\n"
        f'{{"passed": true/false, "feedback": "原因或空字符串"}}\n\n'
        f"用户原始问题：{user_query}\n\n"
        f"助手回复：{assistant_reply}"
    )

    try:
        # 尝试使用结构化输出
        structured_llm = llm.with_structured_output(QualityCheckResult)
        result = structured_llm.invoke([HumanMessage(content=prompt)])
        passed = result.passed
        feedback = result.feedback
    except Exception as e:
        print(f"[QUALITY] 结构化输出失败，尝试 JSON 解析回退: {e}")
        try:
            raw_response = llm.invoke([HumanMessage(content=prompt)])
            resp_text = str(raw_response.content) if raw_response.content else ""
            json_text = extract_json_from_text(resp_text)

            if json_text:
                parsed = json.loads(json_text)
                passed = bool(parsed.get("passed", True))
                feedback = str(parsed.get("feedback", ""))
            else:
                raise ValueError(f"无法从 LLM 响应中提取 JSON: {resp_text[:200]}")
        except Exception as e2:
            print(f"[QUALITY] 质量检查异常，回退到通过: {e2}")
            passed = True
            feedback = ""

    print(f"[QUALITY] 检查结果: passed={passed}, feedback={feedback[:100] if feedback else ''}")
    return {"quality_passed": passed, "quality_feedback": feedback}


def plan_refinement_node(state: AgentState) -> dict:
    """计划重 refinement 节点：根据质量反馈修订执行计划。

    1. 检查 quality_passed 和 plan_refinement_count。
    2. 如果已通过或重 refinement 次数 >= 2，返回空字典。
    3. 否则调用 LLM 生成修订后的计划。
    4. 返回新计划、重置 step_index 和 step_results、增加 refinement_count。

    异常时返回空字典。
    """
    quality_passed = state.get("quality_passed", True)
    plan_refinement_count = state.get("plan_refinement_count", 0)

    if quality_passed or plan_refinement_count >= 2:
        return {}

    feedback = state.get("quality_feedback", "")
    plan = state.get("plan", [])
    plan_str = "\n".join(
        f"- {step.step_id}: {step.worker} | {step.input_query} | 依赖: {step.depends_on} | 期望: {step.expected_output}"
        for step in plan
    ) if plan else "（当前无计划）"

    prompt = (
        f"{PLAN_REFINEMENT_PROMPT}\n\n"
        f"请严格返回以下 JSON 格式，不要添加 markdown 代码块或其他说明：\n"
        f'{{"plan": [\n'
        f'  {{"step_id": "step_1", "worker": "search_worker|knowledge_worker|chat_worker|synthesis_worker", '
        f'"input_query": "...", "depends_on": [], "expected_output": "..."}}\n'
        f']}}\n\n'
        f"质量反馈：{feedback}\n\n"
        f"当前计划：\n{plan_str}"
    )

    try:
        structured_llm = llm.with_structured_output(_PlanRefinementResult)
        result = structured_llm.invoke([HumanMessage(content=prompt)])
        new_plan = result.plan

        # 如果返回空计划，回退到默认计划
        if not new_plan:
            raise ValueError("LLM 返回了空计划")

        new_count = plan_refinement_count + 1
        print(f"[REFINEMENT] 计划重 refinement #{new_count} 完成，新计划 {len(new_plan)} 步")
        return {
            "plan": new_plan,
            "current_step_index": 0,
            "step_results": [],
            "plan_refinement_count": new_count,
        }
    except Exception as e:
        print(f"[REFINEMENT] 计划重 refinement 异常，跳过: {e}")
        return {}


def quality_router(state: AgentState) -> str:
    """质量检查路由：决定是否进入计划重 refinement 或直接结束。

    - 如果 quality_passed 为 True 或 plan_refinement_count >= 2，返回 END。
    - 否则返回 "plan_refinement"。
    """
    quality_passed = state.get("quality_passed", True)
    plan_refinement_count = state.get("plan_refinement_count", 0)

    if quality_passed or plan_refinement_count >= 2:
        return END
    return "plan_refinement"


def refinement_router(state: AgentState) -> str:
    """重 refinement 路由：判断重 refinement 后是否重新执行计划。

    - 如果 plan 已更新（current_step_index == 0 且 plan_refinement_count > 0 且 plan 非空），
      返回 "plan_executor"。
    - 否则返回 END。
    """
    current_step_index = state.get("current_step_index", 0)
    plan_refinement_count = state.get("plan_refinement_count", 0)
    plan = state.get("plan", [])

    if current_step_index == 0 and plan_refinement_count > 0 and plan:
        return "plan_executor"
    return END

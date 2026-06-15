"""Supervisor 节点：多意图识别 + 任务复杂度评估 + 计划建议。"""

import json
from typing import Literal

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from services.llm.llm import llm

from ..message_helpers import extract_json_from_text, extract_text_content, last_human_message
from ..prompts import SUPERVISOR_SYSTEM_PROMPT
from ..state import AgentState, IntentItem


class IntentAnalysis(BaseModel):
    """多意图分析结构化输出模型。"""

    primary_intent: str = Field(
        description="主意图标签",
    )
    intents: list[IntentItem] = Field(
        default_factory=list,
        description="识别出的所有意图列表，每个意图包含标签、置信度和推理",
    )
    task_complexity: Literal["simple", "moderate", "complex"] = Field(
        default="simple",
        description="任务复杂度评估：simple(简单) / moderate(中等) / complex(复杂)",
    )
    suggested_plan: list[str] = Field(
        default_factory=list,
        description="如果复杂度为 moderate 或 complex，建议的子任务计划（自然语言描述）",
    )


def supervisor_node(state: AgentState) -> dict:
    """Supervisor 节点：多意图识别 + 任务复杂度评估 + 计划建议。

    1. 从最后一条人类消息中提取文本。
    2. 调用 LLM 进行结构化意图分析。
    3. 返回包含 intents、primary_intent、intent_confidence、intent、iterations 的字典。

    解析失败或 LLM 异常时回退到 primary_intent="other"，空 intents，task_complexity="simple"。
    """
    messages = state["messages"]
    if not messages:
        return {
            "intents": [],
            "primary_intent": "other",
            "intent_confidence": 0.0,
            "intent": "other",
            "iterations": 0,
            "task_complexity": "simple",
            "suggested_plan": [],
        }

    last_message = last_human_message(messages) or messages[-1]
    content = extract_text_content(last_message)
    if not content:
        return {
            "intents": [],
            "primary_intent": "other",
            "intent_confidence": 0.0,
            "intent": "other",
            "iterations": 0,
            "task_complexity": "simple",
            "suggested_plan": [],
        }

    prompt = (
        f"{SUPERVISOR_SYSTEM_PROMPT}\n\n"
        f"请严格返回以下 JSON 格式，不要添加 markdown 代码块或其他说明：\n"
        f'{{{{"primary_intent": "chat|knowledge|search|mixed|compare|summarize|explain|code|calculation|translation|other", '
        f'"intents": [{{"intent": "...", "confidence": 0.0, "reasoning": "...", "suggested_worker": "..."}}], '
        f'"task_complexity": "simple|moderate|complex", '
        f'"suggested_plan": ["步骤1", "步骤2"]}}}}\n\n'
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
        analysis = IntentAnalysis.model_validate(parsed)

        primary_intent = analysis.primary_intent.strip().lower()
        # 取主意图的置信度（从 intents 列表中匹配 primary_intent）
        intent_confidence = 0.0
        for item in analysis.intents:
            if item.intent.strip().lower() == primary_intent:
                intent_confidence = item.confidence
                break
        # 如果 intents 为空，默认 0.0

        print(f"[SUPERVISOR] 分析成功: primary_intent={primary_intent}, "
              f"complexity={analysis.task_complexity}, intents={len(analysis.intents)}")
    except Exception as e:
        print(f"[SUPERVISOR] 分析异常，回退到 other: {e}")
        primary_intent = "other"
        intent_confidence = 0.0
        analysis = IntentAnalysis(
            primary_intent="other",
            intents=[],
            task_complexity="simple",
            suggested_plan=[],
        )

    return {
        "intents": analysis.intents,
        "primary_intent": primary_intent,
        "intent_confidence": intent_confidence,
        "intent": primary_intent,  # 保持向后兼容
        "iterations": 0,
        "task_complexity": analysis.task_complexity,
        "suggested_plan": analysis.suggested_plan,
    }

"""Tests for AgentState and Pydantic models."""

from typing import get_type_hints

import pytest
from pydantic import BaseModel, ValidationError

import sys
from pathlib import Path

# Add project root to path so 'services' module can be imported
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.state import (
    AgentState,
    IntentItem,
    MAX_ITERATIONS,
    MAX_RAW_MESSAGES,
    PlanStep,
    StepResult,
)


def test_constants_exist():
    assert MAX_RAW_MESSAGES == 10
    assert MAX_ITERATIONS == 5


def test_intent_item_model():
    item = IntentItem(
        intent="search",
        confidence=0.95,
        reasoning="用户提到了查找资料",
        suggested_worker="search_worker",
    )
    assert item.intent == "search"
    assert item.confidence == 0.95
    assert item.reasoning == "用户提到了查找资料"
    assert item.suggested_worker == "search_worker"

    # Serialization
    data = item.model_dump()
    assert data["intent"] == "search"
    assert data["confidence"] == 0.95

    # Deserialization
    restored = IntentItem(**data)
    assert restored.intent == "search"


def test_plan_step_model():
    step = PlanStep(
        step_id="step_1",
        worker="knowledge_worker",
        input_query="什么是 LangGraph",
        depends_on=[],
        expected_output="对 LangGraph 的定义和用途说明",
    )
    assert step.step_id == "step_1"
    assert step.depends_on == []

    data = step.model_dump()
    restored = PlanStep(**data)
    assert restored.worker == "knowledge_worker"


def test_step_result_model():
    result = StepResult(
        step_id="step_1",
        worker="knowledge_worker",
        output="LangGraph 是一个用于构建多智能体工作流的库",
        status="success",
    )
    assert result.status == "success"

    data = result.model_dump()
    restored = StepResult(**data)
    assert restored.status == "success"

    # Invalid status should raise validation error
    with pytest.raises(ValidationError):
        StepResult(
            step_id="step_1",
            worker="knowledge_worker",
            output="",
            status="invalid_status",
        )


def test_agent_state_old_fields():
    """Backward compatibility: old fields still work."""
    state = AgentState(
        messages=[],
        summary="",
        intent="chat",
        iterations=0,
        rewrite_query="",
    )
    assert state["messages"] == []
    assert state["intent"] == "chat"
    assert state["iterations"] == 0


def test_agent_state_new_fields():
    """Extended AgentState with new fields."""
    intent_item = IntentItem(
        intent="search",
        confidence=0.9,
        reasoning="需要搜索",
        suggested_worker="search_worker",
    )
    plan_step = PlanStep(
        step_id="step_1",
        worker="search_worker",
        input_query="搜索资料",
        depends_on=[],
        expected_output="搜索结果",
    )
    step_result = StepResult(
        step_id="step_1",
        worker="search_worker",
        output="找到了",
        status="success",
    )

    state = AgentState(
        messages=[],
        summary="",
        intent="mixed",
        iterations=1,
        rewrite_query="优化查询",
        intents=[intent_item],
        primary_intent="search",
        intent_confidence=0.9,
        plan=[plan_step],
        current_step_index=0,
        step_results=[step_result],
        plan_refinement_count=0,
        knowledge_results="",
        search_results="",
        synthesis_context="",
        quality_passed=True,
        quality_feedback="",
        task_complexity="complex",
        suggested_plan=["搜索", "查询知识库", "综合"],
    )

    assert state["intents"][0].intent == "search"
    assert state["primary_intent"] == "search"
    assert state["intent_confidence"] == 0.9
    assert state["plan"][0].step_id == "step_1"
    assert state["current_step_index"] == 0
    assert state["step_results"][0].status == "success"
    assert state["plan_refinement_count"] == 0
    assert state["knowledge_results"] == ""
    assert state["search_results"] == ""
    assert state["synthesis_context"] == ""
    assert state["quality_passed"] is True
    assert state["quality_feedback"] == ""
    assert state["task_complexity"] == "complex"
    assert state["suggested_plan"] == ["搜索", "查询知识库", "综合"]

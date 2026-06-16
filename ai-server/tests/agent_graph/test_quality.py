"""Tests for quality check and plan refinement nodes."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.state import AgentState, PlanStep, StepResult


# ========== Fixtures ==========

@pytest.fixture
def base_state():
    return AgentState(
        messages=[
            HumanMessage(content="帮我查一下 LangGraph 的最新资料"),
            AIMessage(content="LangGraph 是 LangChain 的扩展框架，用于构建有状态的多智能体应用。"),
        ],
        summary="",
        intent="mixed",
        iterations=0,
        rewrite_query="",
        primary_intent="mixed",
        knowledge_results="",
        search_results="",
        step_results=[],
        plan=[],
        current_step_index=0,
        plan_refinement_count=0,
        quality_passed=False,
        quality_feedback="",
    )


@pytest.fixture
def failed_quality_state():
    return AgentState(
        messages=[
            HumanMessage(content="帮我查一下 LangGraph 的最新资料"),
            AIMessage(content="LangGraph 是 LangChain 的扩展框架。"),
        ],
        summary="",
        intent="mixed",
        iterations=0,
        rewrite_query="",
        primary_intent="mixed",
        knowledge_results="",
        search_results="",
        step_results=[
            StepResult(step_id="step_1", worker="search_worker", output="搜索结果", status="success"),
        ],
        plan=[
            PlanStep(
                step_id="step_1",
                worker="search_worker",
                input_query="LangGraph 最新资料",
                depends_on=[],
                expected_output="搜索结果",
            ),
            PlanStep(
                step_id="step_2",
                worker="knowledge_worker",
                input_query="LangGraph 知识库",
                depends_on=["step_1"],
                expected_output="知识库结果",
            ),
        ],
        current_step_index=2,
        plan_refinement_count=0,
        quality_passed=False,
        quality_feedback="回答缺少知识库结果，不够全面",
    )


# ========== quality_check_node tests ==========

class TestQualityCheckNode:

    @patch("services.agent_graph.quality.node.llm")
    def test_returns_passed_true_for_good_reply(self, mock_llm, base_state):
        """quality_check_node returns passed=True for a good reply."""
        from services.agent_graph.quality.node import quality_check_node

        mock_result = MagicMock()
        mock_result.passed = True
        mock_result.feedback = ""
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_result

        result = quality_check_node(base_state)

        assert result["quality_passed"] is True
        assert result["quality_feedback"] == ""

    @patch("services.agent_graph.quality.node.llm")
    def test_returns_passed_false_for_incomplete_reply(self, mock_llm, base_state):
        """quality_check_node returns passed=False for incomplete reply."""
        from services.agent_graph.quality.node import quality_check_node

        mock_result = MagicMock()
        mock_result.passed = False
        mock_result.feedback = "回答缺少知识库结果，不够全面"
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_result

        result = quality_check_node(base_state)

        assert result["quality_passed"] is False
        assert result["quality_feedback"] == "回答缺少知识库结果，不够全面"

    @patch("services.agent_graph.quality.node.llm")
    def test_fallback_on_error(self, mock_llm, base_state):
        """quality_check_node fallback to passed=True on error."""
        from services.agent_graph.quality.node import quality_check_node

        mock_llm.with_structured_output.return_value.invoke.side_effect = Exception("LLM error")

        result = quality_check_node(base_state)

        assert result["quality_passed"] is True
        assert result["quality_feedback"] == ""

    @patch("services.agent_graph.quality.node.llm")
    def test_reads_last_assistant_message_and_original_query(self, mock_llm, base_state):
        """quality_check_node reads last assistant message and original query."""
        from services.agent_graph.quality.node import quality_check_node

        mock_result = MagicMock()
        mock_result.passed = True
        mock_result.feedback = ""
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_result

        result = quality_check_node(base_state)

        # Verify LLM was called with prompt containing both user query and assistant reply
        call_args = mock_llm.with_structured_output.return_value.invoke.call_args[0][0]
        prompt_text = str(call_args[0].content)
        assert "LangGraph 的最新资料" in prompt_text
        assert "LangGraph 是 LangChain 的扩展框架" in prompt_text


# ========== plan_refinement_node tests ==========

class TestPlanRefinementNode:

    @patch("services.agent_graph.quality.node.llm")
    def test_generates_revised_plan_when_quality_fails_and_count_lt_2(self, mock_llm, failed_quality_state):
        """plan_refinement_node generates revised plan when quality fails and count < 2."""
        from services.agent_graph.quality.node import plan_refinement_node

        mock_result = MagicMock()
        mock_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="search_worker",
                input_query="LangGraph 最新资料 2024",
                depends_on=[],
                expected_output="更全面的搜索结果",
            ),
            PlanStep(
                step_id="step_2",
                worker="knowledge_worker",
                input_query="LangGraph 知识库深度检索",
                depends_on=["step_1"],
                expected_output="知识库结果",
            ),
        ]
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_result

        result = plan_refinement_node(failed_quality_state)

        assert "plan" in result
        assert len(result["plan"]) == 2
        assert result["current_step_index"] == 0
        assert result["step_results"] == []
        assert result["plan_refinement_count"] == 1

    def test_does_nothing_when_quality_passed(self, failed_quality_state):
        """plan_refinement_node does nothing when quality_passed is True."""
        from services.agent_graph.quality.node import plan_refinement_node

        failed_quality_state["quality_passed"] = True

        result = plan_refinement_node(failed_quality_state)

        assert result == {}

    def test_does_nothing_when_refinement_count_gte_2(self, failed_quality_state):
        """plan_refinement_node does nothing when plan_refinement_count >= 2."""
        from services.agent_graph.quality.node import plan_refinement_node

        failed_quality_state["plan_refinement_count"] = 2

        result = plan_refinement_node(failed_quality_state)

        assert result == {}

    @patch("services.agent_graph.quality.node.llm")
    def test_fallback_on_error(self, mock_llm, failed_quality_state):
        """plan_refinement_node returns empty dict on LLM error."""
        from services.agent_graph.quality.node import plan_refinement_node

        mock_llm.with_structured_output.return_value.invoke.side_effect = Exception("LLM error")

        result = plan_refinement_node(failed_quality_state)

        assert result == {}


# ========== quality_router tests ==========

class TestQualityRouter:

    def test_returns_end_when_quality_passed(self):
        """quality_router returns END when quality_passed is True."""
        from services.agent_graph.quality.node import quality_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            quality_passed=True,
            quality_feedback="",
            plan_refinement_count=0,
        )

        assert quality_router(state) == END

    def test_returns_end_when_refinement_count_gte_2(self):
        """quality_router returns END when plan_refinement_count >= 2."""
        from services.agent_graph.quality.node import quality_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            quality_passed=False,
            quality_feedback="回答不完整",
            plan_refinement_count=2,
        )

        assert quality_router(state) == END

    def test_returns_plan_refinement_when_quality_fails_and_count_lt_2(self):
        """quality_router returns 'plan_refinement' when quality fails and count < 2."""
        from services.agent_graph.quality.node import quality_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            quality_passed=False,
            quality_feedback="回答不完整",
            plan_refinement_count=0,
        )

        assert quality_router(state) == "plan_refinement"


# ========== refinement_router tests ==========

class TestRefinementRouter:

    def test_returns_plan_executor_when_plan_updated(self):
        """refinement_router returns 'plan_executor' when plan has been updated."""
        from services.agent_graph.quality.node import refinement_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="search_worker",
                    input_query="新查询",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=1,
        )

        assert refinement_router(state) == "plan_executor"

    def test_returns_end_when_plan_not_updated(self):
        """refinement_router returns END when plan has not been updated."""
        from services.agent_graph.quality.node import refinement_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="search_worker",
                    input_query="旧查询",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=2,
            step_results=[],
            plan_refinement_count=0,
        )

        assert refinement_router(state) == END

    def test_returns_end_when_empty_plan(self):
        """refinement_router returns END when plan is empty."""
        from services.agent_graph.quality.node import refinement_router, END

        state = AgentState(
            messages=[],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            plan=[],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
        )

        assert refinement_router(state) == END

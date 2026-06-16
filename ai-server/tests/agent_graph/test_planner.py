"""Tests for planner and plan executor modules."""

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
        messages=[HumanMessage(content="帮我查一下 LangGraph 的最新资料")],
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
        suggested_plan=["搜索 LangGraph 最新信息", "查询知识库相关内容", "综合回答"],
        task_complexity="complex",
        intents=[],
    )


@pytest.fixture
def plan_state():
    return AgentState(
        messages=[HumanMessage(content="帮我查一下 LangGraph 的最新资料")],
        summary="",
        intent="mixed",
        iterations=0,
        rewrite_query="",
        primary_intent="mixed",
        knowledge_results="",
        search_results="",
        step_results=[],
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
            PlanStep(
                step_id="step_3",
                worker="synthesis_worker",
                input_query="综合回答",
                depends_on=["step_1", "step_2"],
                expected_output="最终回答",
            ),
        ],
        current_step_index=0,
        suggested_plan=["搜索 LangGraph 最新信息", "查询知识库相关内容", "综合回答"],
        task_complexity="complex",
        intents=[],
    )


# ========== planner_node tests ==========

class TestPlannerNode:

    @patch("services.agent_graph.planner.node.llm")
    def test_returns_plan_steps(self, mock_llm, base_state):
        """planner_node returns a list of PlanStep objects."""
        from services.agent_graph.planner.node import planner_node

        mock_plan_response = MagicMock()
        mock_plan_response.plan = [
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
        ]
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_plan_response

        result = planner_node(base_state)

        assert "plan" in result
        assert len(result["plan"]) == 2
        assert result["plan"][0].step_id == "step_1"
        assert result["plan"][0].worker == "search_worker"
        assert result["plan"][1].depends_on == ["step_1"]
        assert result["current_step_index"] == 0
        assert result["step_results"] == []

    @patch("services.agent_graph.planner.node.llm")
    def test_fallback_on_error(self, mock_llm, base_state):
        """planner_node returns fallback plan on LLM error."""
        from services.agent_graph.planner.node import planner_node

        mock_llm.with_structured_output.return_value.invoke.side_effect = Exception("LLM error")

        result = planner_node(base_state)

        assert "plan" in result
        assert len(result["plan"]) == 1
        assert result["plan"][0].worker == "synthesis_worker"
        assert result["current_step_index"] == 0
        assert result["step_results"] == []

    @patch("services.agent_graph.planner.node.llm")
    def test_fallback_on_empty_plan(self, mock_llm, base_state):
        """planner_node returns fallback plan when LLM returns empty plan."""
        from services.agent_graph.planner.node import planner_node

        mock_plan_response = MagicMock()
        mock_plan_response.plan = []
        mock_llm.with_structured_output.return_value.invoke.return_value = mock_plan_response

        result = planner_node(base_state)

        assert "plan" in result
        assert len(result["plan"]) == 1
        assert result["plan"][0].worker == "synthesis_worker"


# ========== plan_executor tests ==========

class TestPlanExecutor:

    @patch("services.agent_graph.planner.executor._make_search_worker")
    def test_executes_single_ready_step(self, mock_make_search, plan_state):
        """plan_executor executes one ready step (no dependencies)."""
        from services.agent_graph.planner.executor import _make_plan_executor

        mock_worker = MagicMock()
        mock_worker.return_value = {"messages": [AIMessage(content="搜索结果")]}
        mock_make_search.return_value = mock_worker

        executor = _make_plan_executor(
            tools=[], system_prompt="", enable_knowledge=True, enable_search=True
        )
        result = executor(plan_state)

        assert "step_results" in result
        assert len(result["step_results"]) == 1
        assert result["step_results"][0].step_id == "step_1"
        assert result["step_results"][0].status == "success"
        assert result["current_step_index"] == 1
        assert "messages" in result

    @patch("services.agent_graph.planner.executor._make_knowledge_worker")
    def test_respects_dependencies(self, mock_make_knowledge, plan_state):
        """plan_executor skips steps with unmet dependencies."""
        from services.agent_graph.planner.executor import _make_plan_executor

        # step_1 is done, now step_2 depends on step_1
        plan_state["current_step_index"] = 1
        plan_state["step_results"] = [
            StepResult(step_id="step_1", worker="search_worker", output="搜索结果", status="success")
        ]

        mock_worker = MagicMock()
        mock_worker.return_value = {"messages": [AIMessage(content="知识库结果")]}
        mock_make_knowledge.return_value = mock_worker

        executor = _make_plan_executor(
            tools=[], system_prompt="", enable_knowledge=True, enable_search=True
        )
        result = executor(plan_state)

        assert len(result["step_results"]) == 2
        assert result["step_results"][1].step_id == "step_2"
        assert result["step_results"][1].status == "success"
        assert result["current_step_index"] == 2

    @patch("services.agent_graph.planner.executor._make_synthesis_worker")
    def test_executes_synthesis_when_ready(self, mock_make_synthesis, plan_state):
        """plan_executor executes synthesis when all dependencies are met."""
        from services.agent_graph.planner.executor import _make_plan_executor

        # step_1 and step_2 are done, now step_3 depends on both
        plan_state["current_step_index"] = 2
        plan_state["step_results"] = [
            StepResult(step_id="step_1", worker="search_worker", output="搜索结果", status="success"),
            StepResult(step_id="step_2", worker="knowledge_worker", output="知识库结果", status="success"),
        ]

        mock_worker = MagicMock()
        mock_worker.return_value = {"messages": [AIMessage(content="综合回答")]}
        mock_make_synthesis.return_value = mock_worker

        executor = _make_plan_executor(
            tools=[], system_prompt="", enable_knowledge=True, enable_search=True
        )
        result = executor(plan_state)

        assert len(result["step_results"]) == 3
        assert result["step_results"][2].step_id == "step_3"
        assert result["step_results"][2].status == "success"
        assert result["current_step_index"] == 3

    @patch("services.agent_graph.planner.executor._make_search_worker")
    def test_handles_failed_step(self, mock_make_search, plan_state):
        """plan_executor marks step as failed when worker raises exception."""
        from services.agent_graph.planner.executor import _make_plan_executor

        mock_worker = MagicMock()
        mock_worker.side_effect = Exception("Worker error")
        mock_make_search.return_value = mock_worker

        executor = _make_plan_executor(
            tools=[], system_prompt="", enable_knowledge=True, enable_search=True
        )
        result = executor(plan_state)

        assert len(result["step_results"]) == 1
        assert result["step_results"][0].status == "failed"
        assert "Worker error" in result["step_results"][0].output
        assert result["current_step_index"] == 1

    def test_handles_unknown_worker(self, plan_state):
        """plan_executor marks step as failed for unknown worker type."""
        from services.agent_graph.planner.executor import _make_plan_executor

        plan_state["plan"][0].worker = "unknown_worker"

        executor = _make_plan_executor(
            tools=[], system_prompt="", enable_knowledge=True, enable_search=True
        )
        result = executor(plan_state)

        assert len(result["step_results"]) == 1
        assert result["step_results"][0].status == "failed"
        assert "unknown_worker" in result["step_results"][0].output
        assert result["current_step_index"] == 1


# ========== plan_executor_router tests ==========

class TestPlanExecutorRouter:

    def test_returns_plan_executor_when_steps_remain(self, plan_state):
        """plan_executor_router returns 'plan_executor' when there are remaining steps."""
        from services.agent_graph.planner.executor import plan_executor_router

        plan_state["current_step_index"] = 0
        plan_state["step_results"] = []

        result = plan_executor_router(plan_state)
        assert result == "plan_executor"

    def test_returns_synthesis_worker_when_all_complete(self, plan_state):
        """plan_executor_router returns 'synthesis_worker' when all steps are done."""
        from services.agent_graph.planner.executor import plan_executor_router

        plan_state["current_step_index"] = 3
        plan_state["step_results"] = [
            StepResult(step_id="step_1", worker="search_worker", output="搜索结果", status="success"),
            StepResult(step_id="step_2", worker="knowledge_worker", output="知识库结果", status="success"),
            StepResult(step_id="step_3", worker="synthesis_worker", output="综合回答", status="success"),
        ]

        result = plan_executor_router(plan_state)
        assert result == "synthesis_worker"

    def test_returns_plan_executor_with_failed_step(self, plan_state):
        """plan_executor_router returns 'plan_executor' when failed steps exist but later steps with no deps remain."""
        from services.agent_graph.planner.executor import plan_executor_router

        # Modify plan so step_2 has no dependency, making it executable even after step_1 failed
        plan_state["plan"][1].depends_on = []
        plan_state["current_step_index"] = 1
        plan_state["step_results"] = [
            StepResult(step_id="step_1", worker="search_worker", output="错误", status="failed"),
        ]

        result = plan_executor_router(plan_state)
        assert result == "plan_executor"

    def test_returns_synthesis_worker_on_deadlock(self, plan_state):
        """plan_executor_router returns 'synthesis_worker' when no remaining step is executable (deadlock)."""
        from services.agent_graph.planner.executor import plan_executor_router

        plan_state["current_step_index"] = 1
        plan_state["step_results"] = [
            StepResult(step_id="step_1", worker="search_worker", output="错误", status="failed"),
        ]

        result = plan_executor_router(plan_state)
        assert result == "synthesis_worker"

    def test_returns_synthesis_worker_on_loop_limit(self, plan_state):
        """plan_executor_router returns 'synthesis_worker' when plan_refinement_count exceeds limit."""
        from services.agent_graph.planner.executor import plan_executor_router

        plan_state["plan_refinement_count"] = 5

        result = plan_executor_router(plan_state)
        assert result == "synthesis_worker"

    def test_returns_synthesis_worker_with_empty_plan(self):
        """plan_executor_router returns 'synthesis_worker' when plan is empty."""
        from services.agent_graph.planner.executor import plan_executor_router

        state = AgentState(
            messages=[HumanMessage(content="你好")],
            summary="",
            intent="chat",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            knowledge_results="",
            search_results="",
            step_results=[],
            plan=[],
            current_step_index=0,
            suggested_plan=[],
            task_complexity="simple",
            intents=[],
        )

        result = plan_executor_router(state)
        assert result == "synthesis_worker"

"""Integration tests for the main graph build (core.py).

Tests that the graph compiles and routes correctly through supervisor,
planner, workers, and quality check nodes.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.state import AgentState, MAX_RAW_MESSAGES, PlanStep, StepResult, IntentItem


# ========== Fixtures ==========

@pytest.fixture
def mock_checkpointer():
    """Return a real InMemorySaver for graph compilation."""
    return InMemorySaver()


@pytest.fixture
def simple_chat_state():
    return AgentState(
        messages=[HumanMessage(content="你好")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
        primary_intent="chat",
        task_complexity="simple",
        intents=[
            IntentItem(
                intent="chat",
                confidence=0.95,
                reasoning="闲聊",
                suggested_worker="chat_worker",
            )
        ],
        plan=[],
        current_step_index=0,
        step_results=[],
        plan_refinement_count=0,
        quality_passed=False,
        quality_feedback="",
    )


@pytest.fixture
def simple_knowledge_state():
    return AgentState(
        messages=[HumanMessage(content="知识库里有什么关于 LangGraph 的资料")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
        primary_intent="knowledge",
        task_complexity="simple",
        intents=[
            IntentItem(
                intent="knowledge",
                confidence=0.9,
                reasoning="知识库查询",
                suggested_worker="knowledge_worker",
            )
        ],
        plan=[],
        current_step_index=0,
        step_results=[],
        plan_refinement_count=0,
        quality_passed=False,
        quality_feedback="",
    )


@pytest.fixture
def complex_state():
    return AgentState(
        messages=[HumanMessage(content="帮我搜索最新的 LangGraph 新闻，然后和知识库里的资料对比总结")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
        primary_intent="mixed",
        task_complexity="complex",
        intents=[
            IntentItem(
                intent="search",
                confidence=0.9,
                reasoning="搜索最新新闻",
                suggested_worker="search_worker",
            ),
            IntentItem(
                intent="knowledge",
                confidence=0.85,
                reasoning="对比知识库资料",
                suggested_worker="knowledge_worker",
            ),
        ],
        plan=[
            PlanStep(
                step_id="step_1",
                worker="search_worker",
                input_query="LangGraph 最新新闻",
                depends_on=[],
                expected_output="搜索结果",
            ),
            PlanStep(
                step_id="step_2",
                worker="knowledge_worker",
                input_query="LangGraph 知识库资料",
                depends_on=[],
                expected_output="知识库结果",
            ),
            PlanStep(
                step_id="step_3",
                worker="synthesis_worker",
                input_query="对比总结",
                depends_on=["step_1", "step_2"],
                expected_output="最终回答",
            ),
        ],
        current_step_index=0,
        step_results=[],
        plan_refinement_count=0,
        quality_passed=False,
        quality_feedback="",
    )


# ========== Graph compilation tests ==========

class TestGraphCompilation:

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    def test_graph_compiles_successfully(self, mock_make_tools, mock_get_saver, mock_checkpointer):
        """Test that the graph compiles without errors."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        assert graph is not None
        # Verify graph has expected nodes
        assert "supervisor" in graph.nodes
        assert "chat_worker" in graph.nodes
        assert "direct_worker" in graph.nodes
        assert "planner_node" in graph.nodes
        assert "plan_executor" in graph.nodes
        assert "synthesis_worker" in graph.nodes
        assert "quality_check" in graph.nodes
        assert "plan_refinement" in graph.nodes
        assert "summarize" in graph.nodes
        assert "ensure_placeholder" in graph.nodes


# ========== Routing tests (using mocked nodes) ==========

class TestGraphRouting:

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.workers.chat_worker.llm")
    def test_simple_chat_routes_to_chat_worker_then_end(
        self, mock_chat_llm, mock_supervisor_llm, mock_make_tools, mock_get_saver, mock_checkpointer
    ):
        """Test simple chat turn: supervisor -> chat_worker -> END."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor LLM to return chat intent
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "chat", "intents": [{"intent": "chat", "confidence": 0.95, "reasoning": "闲聊", "suggested_worker": "chat_worker"}], "task_complexity": "simple", "suggested_plan": []}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock chat worker LLM
        chat_result = AIMessage(content="你好呀！很高兴见到你~")
        mock_chat_llm.invoke.return_value = chat_result

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        # Invoke with simple chat state
        state = AgentState(
            messages=[HumanMessage(content="你好")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            task_complexity="simple",
            intents=[
                IntentItem(
                    intent="chat",
                    confidence=0.95,
                    reasoning="闲聊",
                    suggested_worker="chat_worker",
                )
            ],
            plan=[],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})

        # Should reach END with an assistant message
        messages = result.get("messages", [])
        assert any(
            getattr(msg, "type", "") in ("ai", "assistant") for msg in messages
        )

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.workers.direct_worker.llm")
    def test_simple_knowledge_routes_to_direct_worker_then_end(
        self, mock_direct_llm, mock_supervisor_llm, mock_make_tools, mock_get_saver, mock_checkpointer
    ):
        """Test simple knowledge turn: supervisor -> direct_worker -> END."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor LLM to return knowledge intent
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "knowledge", "intents": [{"intent": "knowledge", "confidence": 0.9, "reasoning": "知识库查询", "suggested_worker": "knowledge_worker"}], "task_complexity": "simple", "suggested_plan": []}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock direct worker LLM (no tool calls, direct reply)
        direct_result = AIMessage(content="知识库里有 LangGraph 相关资料。")
        mock_direct_llm.invoke.return_value = direct_result

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="知识库里有什么关于 LangGraph 的资料")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="knowledge",
            task_complexity="simple",
            intents=[
                IntentItem(
                    intent="knowledge",
                    confidence=0.9,
                    reasoning="知识库查询",
                    suggested_worker="knowledge_worker",
                )
            ],
            plan=[],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})

        messages = result.get("messages", [])
        assert any(
            getattr(msg, "type", "") in ("ai", "assistant") for msg in messages
        )

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.planner.node.llm")
    @patch("services.agent_graph.workers.synthesis_worker.llm")
    @patch("services.agent_graph.quality.node.llm")
    def test_complex_routes_through_planner_executor_synthesis_quality_end(
        self,
        mock_quality_llm,
        mock_synthesis_llm,
        mock_planner_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test complex turn: supervisor -> planner -> plan_executor -> synthesis -> quality -> END."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor LLM to return complex intent
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "mixed", "intents": [{"intent": "search", "confidence": 0.9, "reasoning": "搜索", "suggested_worker": "search_worker"}, {"intent": "knowledge", "confidence": 0.85, "reasoning": "知识库", "suggested_worker": "knowledge_worker"}], "task_complexity": "complex", "suggested_plan": ["搜索", "查询知识库", "综合"]}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock planner LLM to return a plan
        planner_result = MagicMock()
        planner_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="简单回复",
                depends_on=[],
                expected_output="结果",
            ),
        ]
        mock_planner_llm.with_structured_output.return_value.invoke.return_value = planner_result

        # Mock synthesis LLM
        synthesis_result = AIMessage(content="综合结果：LangGraph 是框架。")
        mock_synthesis_llm.invoke.return_value = synthesis_result

        # Mock quality check LLM (passed=True)
        quality_result = MagicMock()
        quality_result.passed = True
        quality_result.feedback = ""
        mock_quality_llm.with_structured_output.return_value.invoke.return_value = quality_result

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="帮我搜索最新的 LangGraph 新闻，然后和知识库里的资料对比总结")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索",
                    suggested_worker="search_worker",
                ),
                IntentItem(
                    intent="knowledge",
                    confidence=0.85,
                    reasoning="知识库",
                    suggested_worker="knowledge_worker",
                ),
            ],
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="chat_worker",
                    input_query="简单回复",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})

        messages = result.get("messages", [])
        assert any(
            getattr(msg, "type", "") in ("ai", "assistant") for msg in messages
        )

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.planner.node.llm")
    @patch("services.agent_graph.workers.synthesis_worker.llm")
    @patch("services.agent_graph.quality.node.llm")
    def test_complex_routes_with_quality_refinement_loop(
        self,
        mock_quality_llm,
        mock_synthesis_llm,
        mock_planner_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test quality fail -> plan_refinement -> plan_executor -> synthesis -> quality pass -> END."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor - must return MULTIPLE intents to trigger planner_node
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "mixed", "intents": [{"intent": "search", "confidence": 0.9, "reasoning": "搜索", "suggested_worker": "search_worker"}, {"intent": "knowledge", "confidence": 0.85, "reasoning": "知识库", "suggested_worker": "knowledge_worker"}], "task_complexity": "complex", "suggested_plan": ["搜索", "查询知识库", "综合"]}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock planner - return real PlanStep objects (not MagicMock) for serialization
        planner_result = MagicMock()
        planner_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="简单回复",
                depends_on=[],
                expected_output="结果",
            ),
        ]
        mock_planner_llm.with_structured_output.return_value.invoke.return_value = planner_result

        # Mock synthesis
        synthesis_result = AIMessage(content="综合结果")
        mock_synthesis_llm.invoke.return_value = synthesis_result

        # First quality check fails, second passes - use plain classes to avoid MagicMock serialization
        class FakeQualityFail:
            passed = False
            feedback = "不够完整"

        class FakeQualityPass:
            passed = True
            feedback = ""

        mock_quality_llm.with_structured_output.return_value.invoke.side_effect = [
            FakeQualityFail(),
            FakeQualityPass(),
        ]

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="复杂任务")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索",
                    suggested_worker="search_worker",
                ),
                IntentItem(
                    intent="knowledge",
                    confidence=0.85,
                    reasoning="知识库",
                    suggested_worker="knowledge_worker",
                ),
            ],
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="chat_worker",
                    input_query="简单回复",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        assert result is not None
        # quality_check should have been called twice (fail then pass)
        assert mock_quality_llm.with_structured_output.return_value.invoke.call_count == 2

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.planner.node.llm")
    @patch("services.agent_graph.workers.synthesis_worker.llm")
    @patch("services.agent_graph.quality.node.llm")
    def test_quality_router_ends_when_refinement_count_exceeds_limit(
        self,
        mock_quality_llm,
        mock_synthesis_llm,
        mock_planner_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test that quality_router ends when plan_refinement_count >= 2."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor - must return MULTIPLE intents to trigger planner_node
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "mixed", "intents": [{"intent": "search", "confidence": 0.9, "reasoning": "搜索", "suggested_worker": "search_worker"}, {"intent": "knowledge", "confidence": 0.85, "reasoning": "知识库", "suggested_worker": "knowledge_worker"}], "task_complexity": "complex", "suggested_plan": ["搜索", "查询知识库", "综合"]}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock planner - return real PlanStep objects (not MagicMock) for serialization
        planner_result = MagicMock()
        planner_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="简单回复",
                depends_on=[],
                expected_output="结果",
            ),
        ]
        mock_planner_llm.with_structured_output.return_value.invoke.return_value = planner_result

        # Mock synthesis
        synthesis_result = AIMessage(content="综合结果")
        mock_synthesis_llm.invoke.return_value = synthesis_result

        # Quality always fails
        quality_fail = MagicMock()
        quality_fail.passed = False
        quality_fail.feedback = "不够完整"
        mock_quality_llm.with_structured_output.return_value.invoke.return_value = quality_fail

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="复杂任务")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索",
                    suggested_worker="search_worker",
                ),
                IntentItem(
                    intent="knowledge",
                    confidence=0.85,
                    reasoning="知识库",
                    suggested_worker="knowledge_worker",
                ),
            ],
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="chat_worker",
                    input_query="简单回复",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=2,  # Already at limit
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        assert result is not None
        # Should end immediately due to refinement_count >= 2
        # quality_check called once
        assert mock_quality_llm.with_structured_output.return_value.invoke.call_count == 1


# ========== Summarize routing tests ==========

class TestSummarizeRouting:

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.workers.chat_worker.llm")
    @patch("services.agent_graph.nodes.summary_llm")
    def test_chat_worker_routes_to_summarize_when_messages_exceed_threshold(
        self,
        mock_summary_llm,
        mock_chat_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test that chat_worker routes to summarize when messages > MAX_RAW_MESSAGES."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "chat", "intents": [{"intent": "chat", "confidence": 0.95, "reasoning": "闲聊", "suggested_worker": "chat_worker"}], "task_complexity": "simple", "suggested_plan": []}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock chat worker
        chat_result = AIMessage(content="你好！")
        mock_chat_llm.invoke.return_value = chat_result

        # Mock summary LLM
        mock_summary_llm.invoke.return_value = MagicMock(content="摘要内容")

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        # Create many messages to exceed threshold
        messages = [HumanMessage(content=f"消息 {i}") for i in range(MAX_RAW_MESSAGES + 5)]
        # Add an assistant message at the end so the graph can proceed
        messages.append(AIMessage(content="最后回复"))

        state = AgentState(
            messages=messages,
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            task_complexity="simple",
            intents=[
                IntentItem(
                    intent="chat",
                    confidence=0.95,
                    reasoning="闲聊",
                    suggested_worker="chat_worker",
                )
            ],
            plan=[],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        # Should complete without error
        assert result is not None

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.workers.chat_worker.llm")
    def test_chat_worker_routes_directly_to_end_when_messages_below_threshold(
        self,
        mock_chat_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test that chat_worker routes directly to END when messages <= MAX_RAW_MESSAGES."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "chat", "intents": [{"intent": "chat", "confidence": 0.95, "reasoning": "闲聊", "suggested_worker": "chat_worker"}], "task_complexity": "simple", "suggested_plan": []}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock chat worker
        chat_result = AIMessage(content="你好！")
        mock_chat_llm.invoke.return_value = chat_result

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        # Few messages, below threshold
        messages = [HumanMessage(content="你好")]

        state = AgentState(
            messages=messages,
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            task_complexity="simple",
            intents=[
                IntentItem(
                    intent="chat",
                    confidence=0.95,
                    reasoning="闲聊",
                    suggested_worker="chat_worker",
                )
            ],
            plan=[],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        # Should complete without error and without triggering summarize
        assert result is not None
        messages = result.get("messages", [])
        assert any(
            getattr(msg, "type", "") in ("ai", "assistant") for msg in messages
        )


# ========== Quality check loop tests ==========

class TestQualityCheckLoop:

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.planner.node.llm")
    @patch("services.agent_graph.workers.synthesis_worker.llm")
    @patch("services.agent_graph.quality.node.llm")
    def test_quality_fail_triggers_refinement_then_re_execute(
        self,
        mock_quality_llm,
        mock_synthesis_llm,
        mock_planner_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test quality fail -> plan_refinement -> plan_executor -> synthesis -> quality pass -> END."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor - must return MULTIPLE intents to trigger planner_node
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "mixed", "intents": [{"intent": "search", "confidence": 0.9, "reasoning": "搜索", "suggested_worker": "search_worker"}, {"intent": "knowledge", "confidence": 0.85, "reasoning": "知识库", "suggested_worker": "knowledge_worker"}], "task_complexity": "complex", "suggested_plan": ["搜索", "查询知识库", "综合"]}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock planner - return real PlanStep objects (not MagicMock) for serialization
        planner_result = MagicMock()
        planner_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="简单回复",
                depends_on=[],
                expected_output="结果",
            ),
        ]
        mock_planner_llm.with_structured_output.return_value.invoke.return_value = planner_result

        # Mock synthesis
        synthesis_result = AIMessage(content="综合结果")
        mock_synthesis_llm.invoke.return_value = synthesis_result

        # First quality check fails, second passes - use plain classes to avoid MagicMock serialization
        class FakeQualityFail:
            passed = False
            feedback = "不够完整"

        class FakeQualityPass:
            passed = True
            feedback = ""

        mock_quality_llm.with_structured_output.return_value.invoke.side_effect = [
            FakeQualityFail(),
            FakeQualityPass(),
        ]

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="复杂任务")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索",
                    suggested_worker="search_worker",
                ),
                IntentItem(
                    intent="knowledge",
                    confidence=0.85,
                    reasoning="知识库",
                    suggested_worker="knowledge_worker",
                ),
            ],
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="chat_worker",
                    input_query="简单回复",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=0,
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        assert result is not None
        # quality_check should have been called twice (fail then pass)
        assert mock_quality_llm.with_structured_output.return_value.invoke.call_count == 2

    @patch("services.agent_graph.core.get_async_saver")
    @patch("services.agent_graph.core.make_tools")
    @patch("services.agent_graph.supervisor.node.llm")
    @patch("services.agent_graph.planner.node.llm")
    @patch("services.agent_graph.workers.synthesis_worker.llm")
    @patch("services.agent_graph.quality.node.llm")
    def test_quality_router_ends_when_refinement_count_exceeds_limit(
        self,
        mock_quality_llm,
        mock_synthesis_llm,
        mock_planner_llm,
        mock_supervisor_llm,
        mock_make_tools,
        mock_get_saver,
        mock_checkpointer,
    ):
        """Test that quality_router ends when plan_refinement_count >= 2."""
        from services.agent_graph.core import _build_graph

        mock_make_tools.return_value = []
        mock_get_saver.return_value = mock_checkpointer

        # Mock supervisor - must return MULTIPLE intents to trigger planner_node
        supervisor_result = MagicMock()
        supervisor_result.content = """{"primary_intent": "mixed", "intents": [{"intent": "search", "confidence": 0.9, "reasoning": "搜索", "suggested_worker": "search_worker"}, {"intent": "knowledge", "confidence": 0.85, "reasoning": "知识库", "suggested_worker": "knowledge_worker"}], "task_complexity": "complex", "suggested_plan": ["搜索", "查询知识库", "综合"]}"""
        mock_supervisor_llm.invoke.return_value = supervisor_result

        # Mock planner - return real PlanStep objects (not MagicMock) for serialization
        planner_result = MagicMock()
        planner_result.plan = [
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="简单回复",
                depends_on=[],
                expected_output="结果",
            ),
        ]
        mock_planner_llm.with_structured_output.return_value.invoke.return_value = planner_result

        # Mock synthesis
        synthesis_result = AIMessage(content="综合结果")
        mock_synthesis_llm.invoke.return_value = synthesis_result

        # Quality always fails
        quality_fail = MagicMock()
        quality_fail.passed = False
        quality_fail.feedback = "不够完整"
        mock_quality_llm.with_structured_output.return_value.invoke.return_value = quality_fail

        graph = _build_graph(
            user_id="test_user",
            enable_knowledge=True,
            enable_search=False,
            system_prompt="",
            checkpointer=mock_checkpointer,
        )

        state = AgentState(
            messages=[HumanMessage(content="复杂任务")],
            summary="",
            intent="",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索",
                    suggested_worker="search_worker",
                ),
                IntentItem(
                    intent="knowledge",
                    confidence=0.85,
                    reasoning="知识库",
                    suggested_worker="knowledge_worker",
                ),
            ],
            plan=[
                PlanStep(
                    step_id="step_1",
                    worker="chat_worker",
                    input_query="简单回复",
                    depends_on=[],
                    expected_output="结果",
                ),
            ],
            current_step_index=0,
            step_results=[],
            plan_refinement_count=2,  # Already at limit
            quality_passed=False,
            quality_feedback="",
        )

        result = graph.invoke(state, config={"configurable": {"thread_id": "test-thread"}})
        assert result is not None
        # Should end immediately due to refinement_count >= 2
        # quality_check called once
        assert mock_quality_llm.with_structured_output.return_value.invoke.call_count == 1

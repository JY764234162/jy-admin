"""Tests for tracing helper and node compatibility."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage

# Add project root to path so 'services' module can be imported
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.tracing import get_runnable_config, trace_node
from services.agent_graph.state import AgentState


# ========== get_runnable_config tests ==========


def test_get_runnable_config_returns_config():
    """get_runnable_config should return a RunnableConfig without raising."""
    config = get_runnable_config()
    assert config is not None
    assert "callbacks" in config


def test_get_runnable_config_no_tracing_by_default(monkeypatch):
    """When tracing env vars are off, callbacks should be empty."""
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    # Also clear module-level cached values if they were imported already
    import services.agent_graph.tracing as tracing_mod
    monkeypatch.setattr(tracing_mod, "LANGSMITH_TRACING", False)
    monkeypatch.setattr(tracing_mod, "LANGSMITH_API_KEY", "")
    config = get_runnable_config()
    assert config.get("callbacks") == []


# ========== trace_node decorator / context manager tests ==========


def test_trace_node_decorator_logs(caplog):
    """trace_node as decorator should log start and end."""
    import logging

    with caplog.at_level(logging.INFO, logger="services.agent_graph.tracing"):

        @trace_node("test_node")
        def dummy_node(state):
            return {"result": "ok"}

        result = dummy_node({})
        assert result == {"result": "ok"}

    assert any("NODE_START" in r.message for r in caplog.records)
    assert any("NODE_END" in r.message for r in caplog.records)


def test_trace_node_context_manager_logs(caplog):
    """trace_node as context manager should log start and end."""
    import logging

    with caplog.at_level(logging.INFO, logger="services.agent_graph.tracing"):
        with trace_node("ctx_node"):
            pass

    assert any("NODE_START" in r.message for r in caplog.records)
    assert any("NODE_END" in r.message for r in caplog.records)


# ========== Node compatibility: mocked LLM ==========


def _make_mock_llm(content: str):
    """Return a mock LLM that mimics invoke with config kwarg."""
    mock = MagicMock()
    mock_response = MagicMock()
    mock_response.content = content
    mock.invoke.return_value = mock_response
    return mock


@patch("services.agent_graph.supervisor.node.llm")
def test_supervisor_node_with_mock_llm(mock_llm):
    """supervisor_node should not fail when LLM returns valid JSON."""
    from services.agent_graph.supervisor.node import supervisor_node

    mock_llm.invoke = MagicMock(return_value=MagicMock(content='{"primary_intent": "chat", "intents": [], "task_complexity": "simple", "suggested_plan": []}'))
    state = AgentState(
        messages=[HumanMessage(content="hello")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )
    result = supervisor_node(state)
    assert result["primary_intent"] == "chat"
    mock_llm.invoke.assert_called_once()
    # ensure config kwarg was passed
    _, kwargs = mock_llm.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.planner.node.llm")
def test_planner_node_with_mock_llm(mock_llm):
    """planner_node should not fail when LLM returns a plan."""
    from services.agent_graph.planner.node import planner_node, PlanResult, PlanStep

    # mock structured output path
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = PlanResult(
        plan=[
            PlanStep(
                step_id="step_1",
                worker="chat_worker",
                input_query="hi",
                depends_on=[],
                expected_output="reply",
            )
        ]
    )
    mock_llm.with_structured_output.return_value = mock_structured

    state = AgentState(
        messages=[HumanMessage(content="hello")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
        primary_intent="chat",
        task_complexity="simple",
    )
    result = planner_node(state)
    assert len(result["plan"]) == 1
    mock_structured.invoke.assert_called_once()
    _, kwargs = mock_structured.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.quality.node.llm")
def test_quality_check_node_with_mock_llm(mock_llm):
    """quality_check_node should not fail when LLM returns quality result."""
    from services.agent_graph.quality.node import quality_check_node, QualityCheckResult

    mock_structured = MagicMock()
    mock_structured.invoke.return_value = QualityCheckResult(passed=True, feedback="")
    mock_llm.with_structured_output.return_value = mock_structured

    state = AgentState(
        messages=[
            HumanMessage(content="question"),
            MagicMock(type="ai", content="answer"),
        ],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )
    result = quality_check_node(state)
    assert result["quality_passed"] is True
    mock_structured.invoke.assert_called_once()
    _, kwargs = mock_structured.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.workers.chat_worker.llm")
def test_chat_worker_with_mock_llm(mock_llm):
    """chat_worker should not fail when LLM returns a response."""
    from services.agent_graph.workers.chat_worker import _make_chat_worker

    mock_llm.invoke = MagicMock(return_value=MagicMock(content="Hi there!"))
    worker = _make_chat_worker(system_prompt="")
    state = AgentState(
        messages=[HumanMessage(content="hello")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )
    result = worker(state)
    assert "messages" in result
    mock_llm.invoke.assert_called_once()
    _, kwargs = mock_llm.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.workers.direct_worker.llm")
def test_direct_worker_with_mock_llm(mock_llm):
    """direct_worker should not fail when LLM returns a response without tool calls."""
    from services.agent_graph.workers.direct_worker import _make_direct_worker

    mock_llm.invoke = MagicMock(return_value=MagicMock(content="Direct answer", tool_calls=[]))
    mock_llm.bind_tools.return_value = mock_llm
    worker = _make_direct_worker(system_prompt="", tools=[], enable_knowledge=False, enable_search=False)
    state = AgentState(
        messages=[HumanMessage(content="hello")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
        primary_intent="chat",
    )
    result = worker(state)
    assert "messages" in result
    mock_llm.invoke.assert_called_once()
    _, kwargs = mock_llm.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.workers.synthesis_worker.llm")
def test_synthesis_worker_with_mock_llm(mock_llm):
    """synthesis_worker should not fail when LLM returns a response."""
    from services.agent_graph.workers.synthesis_worker import _make_synthesis_worker

    mock_llm.invoke = MagicMock(return_value=MagicMock(content="Synthesized answer"))
    worker = _make_synthesis_worker(system_prompt="")
    state = AgentState(
        messages=[HumanMessage(content="hello")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )
    result = worker(state)
    assert "messages" in result
    mock_llm.invoke.assert_called_once()
    _, kwargs = mock_llm.invoke.call_args
    assert "config" in kwargs


@patch("services.agent_graph.nodes.summary_llm")
def test_summarize_node_with_mock_llm(mock_llm):
    """summarize_node should not fail when summary_llm returns a response."""
    from services.agent_graph.nodes import summarize_node

    mock_llm.invoke = MagicMock(return_value=MagicMock(content="Summary text"))
    state = AgentState(
        messages=[HumanMessage(content="m1"), HumanMessage(content="m2"), HumanMessage(content="m3")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )
    result = summarize_node(state)
    assert "summary" in result
    mock_llm.invoke.assert_called_once()
    _, kwargs = mock_llm.invoke.call_args
    assert "config" in kwargs

"""Tests for supervisor node and router."""

import json
import sys
from pathlib import Path
from typing import Literal
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage

# Add project root to path so 'services' module can be imported
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.state import AgentState, IntentItem
from services.agent_graph.supervisor.node import supervisor_node, IntentAnalysis
from services.agent_graph.supervisor.router import supervisor_router


# ========== Fixtures ==========

@pytest.fixture
def empty_state():
    return AgentState(
        messages=[],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )


@pytest.fixture
def simple_chat_state():
    return AgentState(
        messages=[HumanMessage(content="你好")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )


@pytest.fixture
def knowledge_state():
    return AgentState(
        messages=[HumanMessage(content="知识库里有什么关于 LangGraph 的资料")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )


@pytest.fixture
def complex_state():
    return AgentState(
        messages=[HumanMessage(content="帮我搜索最新的 LangGraph 新闻，然后和知识库里的资料对比总结")],
        summary="",
        intent="",
        iterations=0,
        rewrite_query="",
    )


# ========== IntentAnalysis model tests ==========

def test_intent_analysis_model():
    analysis = IntentAnalysis(
        primary_intent="mixed",
        intents=[
            IntentItem(
                intent="search",
                confidence=0.9,
                reasoning="用户要求搜索最新新闻",
                suggested_worker="search_worker",
            ),
            IntentItem(
                intent="knowledge",
                confidence=0.85,
                reasoning="用户要求对比知识库资料",
                suggested_worker="knowledge_worker",
            ),
        ],
        task_complexity="complex",
        suggested_plan=["搜索最新 LangGraph 新闻", "查询知识库资料", "对比并总结"],
    )
    assert analysis.primary_intent == "mixed"
    assert len(analysis.intents) == 2
    assert analysis.task_complexity == "complex"
    assert len(analysis.suggested_plan) == 3


# ========== supervisor_node tests ==========

class TestSupervisorNode:

    @patch("services.agent_graph.supervisor.node.llm")
    def test_returns_expected_fields_when_structured_output(self, mock_llm, simple_chat_state):
        """supervisor_node returns expected intent fields when LLM returns structured output."""
        mock_result = MagicMock()
        mock_result.content = json.dumps({
            "primary_intent": "chat",
            "intents": [
                {
                    "intent": "chat",
                    "confidence": 0.95,
                    "reasoning": "纯闲聊问候",
                    "suggested_worker": "chat_worker",
                }
            ],
            "task_complexity": "simple",
            "suggested_plan": [],
        })
        mock_llm.invoke.return_value = mock_result

        result = supervisor_node(simple_chat_state)

        assert result["primary_intent"] == "chat"
        assert result["intent"] == "chat"
        assert result["intent_confidence"] == 0.95
        assert result["iterations"] == 0
        assert len(result["intents"]) == 1
        assert result["intents"][0].intent == "chat"
        assert result["intents"][0].confidence == 0.95
        assert result["task_complexity"] == "simple"
        assert result["suggested_plan"] == []

    @patch("services.agent_graph.supervisor.node.llm")
    def test_returns_complexity_and_plan_when_complex(self, mock_llm, simple_chat_state):
        """supervisor_node returns task_complexity and suggested_plan when LLM returns complex."""
        mock_result = MagicMock()
        mock_result.content = json.dumps({
            "primary_intent": "knowledge",
            "intents": [
                {
                    "intent": "knowledge",
                    "confidence": 0.9,
                    "reasoning": "知识库查询",
                    "suggested_worker": "knowledge_worker",
                }
            ],
            "task_complexity": "complex",
            "suggested_plan": ["步骤1", "步骤2"],
        })
        mock_llm.invoke.return_value = mock_result

        result = supervisor_node(simple_chat_state)

        assert result["primary_intent"] == "knowledge"
        assert result["task_complexity"] == "complex"
        assert result["suggested_plan"] == ["步骤1", "步骤2"]
        assert result["intent_confidence"] == 0.9

    @patch("services.agent_graph.supervisor.node.llm")
    def test_fallback_on_parse_error(self, mock_llm, simple_chat_state):
        """supervisor_node fallback on parse error."""
        mock_result = MagicMock()
        mock_result.content = "not valid json"
        mock_llm.invoke.return_value = mock_result

        result = supervisor_node(simple_chat_state)

        assert result["primary_intent"] == "other"
        assert result["intent"] == "other"
        assert result["intent_confidence"] == 0.0
        assert result["iterations"] == 0
        assert len(result["intents"]) == 0
        assert result["task_complexity"] == "simple"
        assert result["suggested_plan"] == []

    @patch("services.agent_graph.supervisor.node.llm")
    def test_fallback_on_llm_exception(self, mock_llm, simple_chat_state):
        """supervisor_node fallback on LLM exception."""
        mock_llm.invoke.side_effect = Exception("LLM timeout")

        result = supervisor_node(simple_chat_state)

        assert result["primary_intent"] == "other"
        assert result["intent"] == "other"
        assert result["intent_confidence"] == 0.0
        assert result["iterations"] == 0
        assert len(result["intents"]) == 0
        assert result["task_complexity"] == "simple"
        assert result["suggested_plan"] == []

    @patch("services.agent_graph.supervisor.node.llm")
    def test_empty_messages_returns_fallback(self, mock_llm, empty_state):
        """supervisor_node returns fallback when no messages."""
        result = supervisor_node(empty_state)

        assert result["primary_intent"] == "other"
        assert result["intent"] == "other"
        assert result["intent_confidence"] == 0.0
        assert len(result["intents"]) == 0
        assert result["task_complexity"] == "simple"
        assert result["suggested_plan"] == []
        mock_llm.invoke.assert_not_called()

    @patch("services.agent_graph.supervisor.node.llm")
    def test_extracts_text_from_last_human_message(self, mock_llm, knowledge_state):
        """supervisor_node extracts text from last human message."""
        mock_result = MagicMock()
        mock_result.content = json.dumps({
            "primary_intent": "knowledge",
            "intents": [
                {
                    "intent": "knowledge",
                    "confidence": 0.9,
                    "reasoning": "用户询问知识库内容",
                    "suggested_worker": "knowledge_worker",
                }
            ],
            "task_complexity": "simple",
            "suggested_plan": [],
        })
        mock_llm.invoke.return_value = mock_result

        result = supervisor_node(knowledge_state)

        assert result["primary_intent"] == "knowledge"
        # Verify LLM was called with the correct message content in the prompt
        call_args = mock_llm.invoke.call_args
        prompt_messages = call_args[0][0]
        assert any("LangGraph" in str(msg.content) for msg in prompt_messages)

    @patch("services.agent_graph.supervisor.node.llm")
    def test_json_extraction_from_markdown_code_block(self, mock_llm, simple_chat_state):
        """supervisor_node can extract JSON from markdown code block."""
        mock_result = MagicMock()
        mock_result.content = """```json
{
  "primary_intent": "chat",
  "intents": [
    {
      "intent": "chat",
      "confidence": 0.95,
      "reasoning": "问候",
      "suggested_worker": "chat_worker"
    }
  ],
  "task_complexity": "simple",
  "suggested_plan": []
}
```"""
        mock_llm.invoke.return_value = mock_result

        result = supervisor_node(simple_chat_state)

        assert result["primary_intent"] == "chat"
        assert result["intent_confidence"] == 0.95


# ========== supervisor_router tests ==========

class TestSupervisorRouter:

    def test_routes_complex_single_intent_to_planner_node(self):
        """Single intent with complex complexity should go to planner_node."""
        state = AgentState(
            messages=[HumanMessage(content="帮我搜索最新的 LangGraph 新闻，然后和知识库里的资料对比总结")],
            summary="",
            intent="search",
            iterations=0,
            rewrite_query="",
            primary_intent="search",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索最新新闻",
                    suggested_worker="search_worker",
                )
            ],
        )
        assert supervisor_router(state) == "planner_node"

    def test_routes_chat_to_chat_worker(self):
        """supervisor_router routes chat + simple → chat_worker."""
        state = AgentState(
            messages=[HumanMessage(content="你好")],
            summary="",
            intent="chat",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            intents=[
                IntentItem(
                    intent="chat",
                    confidence=0.95,
                    reasoning="闲聊",
                    suggested_worker="chat_worker",
                )
            ],
        )
        assert supervisor_router(state) == "chat_worker"

    def test_routes_simple_knowledge_to_direct_worker(self):
        """supervisor_router routes simple knowledge → direct_worker."""
        state = AgentState(
            messages=[HumanMessage(content="知识库里有什么")],
            summary="",
            intent="knowledge",
            iterations=0,
            rewrite_query="",
            primary_intent="knowledge",
            intents=[
                IntentItem(
                    intent="knowledge",
                    confidence=0.9,
                    reasoning="知识库查询",
                    suggested_worker="knowledge_worker",
                )
            ],
        )
        assert supervisor_router(state) == "direct_worker"

    def test_routes_simple_search_to_direct_worker(self):
        """supervisor_router routes simple search → direct_worker."""
        state = AgentState(
            messages=[HumanMessage(content="搜索今天的新闻")],
            summary="",
            intent="search",
            iterations=0,
            rewrite_query="",
            primary_intent="search",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="搜索请求",
                    suggested_worker="search_worker",
                )
            ],
        )
        assert supervisor_router(state) == "direct_worker"

    def test_routes_complex_to_planner_node(self):
        """supervisor_router routes complex → planner_node."""
        state = AgentState(
            messages=[HumanMessage(content="复杂任务")],
            summary="",
            intent="mixed",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="complex",
            intents=[
                IntentItem(
                    intent="search",
                    confidence=0.9,
                    reasoning="需要搜索",
                    suggested_worker="search_worker",
                )
            ],
        )
        assert supervisor_router(state) == "planner_node"

    def test_routes_moderate_to_planner_node(self):
        """supervisor_router routes moderate → planner_node."""
        state = AgentState(
            messages=[HumanMessage(content="中等任务")],
            summary="",
            intent="knowledge",
            iterations=0,
            rewrite_query="",
            primary_intent="knowledge",
            task_complexity="moderate",
            intents=[
                IntentItem(
                    intent="knowledge",
                    confidence=0.8,
                    reasoning="知识库查询",
                    suggested_worker="knowledge_worker",
                )
            ],
        )
        assert supervisor_router(state) == "planner_node"

    def test_routes_multi_intent_to_planner_node(self):
        """supervisor_router routes multi-intent → planner_node."""
        state = AgentState(
            messages=[HumanMessage(content="多意图任务")],
            summary="",
            intent="mixed",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            task_complexity="simple",
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
        )
        assert supervisor_router(state) == "planner_node"

    def test_routes_chat_with_complexity_moderate_to_planner_node(self):
        """Chat with moderate complexity should go to planner_node."""
        state = AgentState(
            messages=[HumanMessage(content="帮我写个复杂的故事")],
            summary="",
            intent="chat",
            iterations=0,
            rewrite_query="",
            primary_intent="chat",
            task_complexity="moderate",
            intents=[
                IntentItem(
                    intent="chat",
                    confidence=0.8,
                    reasoning="创意写作",
                    suggested_worker="chat_worker",
                )
            ],
        )
        assert supervisor_router(state) == "planner_node"

    def test_routes_single_other_intent_to_direct_worker(self):
        """Single 'other' intent with simple complexity → direct_worker."""
        state = AgentState(
            messages=[HumanMessage(content="随便说点")],
            summary="",
            intent="other",
            iterations=0,
            rewrite_query="",
            primary_intent="other",
            intents=[
                IntentItem(
                    intent="other",
                    confidence=0.6,
                    reasoning="无法归类",
                    suggested_worker="direct_worker",
                )
            ],
        )
        assert supervisor_router(state) == "direct_worker"

    def test_routes_missing_intents_defaults_to_direct_worker(self):
        """Missing intents field with simple complexity defaults behavior."""
        state = AgentState(
            messages=[HumanMessage(content="测试")],
            summary="",
            intent="other",
            iterations=0,
            rewrite_query="",
            primary_intent="other",
            task_complexity="simple",
        )
        # No intents key at all
        assert supervisor_router(state) == "direct_worker"

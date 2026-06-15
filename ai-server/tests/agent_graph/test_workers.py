"""Tests for specialized worker modules."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.state import AgentState, MAX_RAW_MESSAGES
from services.agent_graph.message_helpers import build_assistant_reply_update


# ========== Fixtures ==========

@pytest.fixture
def base_state():
    return AgentState(
        messages=[HumanMessage(content="你好")],
        summary="",
        intent="chat",
        iterations=0,
        rewrite_query="",
        primary_intent="chat",
        knowledge_results="",
        search_results="",
        step_results=[],
    )


@pytest.fixture
def knowledge_intent_state():
    return AgentState(
        messages=[HumanMessage(content="知识库里有什么关于 LangGraph 的资料")],
        summary="",
        intent="knowledge",
        iterations=0,
        rewrite_query="LangGraph 资料",
        primary_intent="knowledge",
        knowledge_results="",
        search_results="",
        step_results=[],
    )


@pytest.fixture
def search_intent_state():
    return AgentState(
        messages=[HumanMessage(content="搜索今天的新闻")],
        summary="",
        intent="search",
        iterations=0,
        rewrite_query="",
        primary_intent="search",
        knowledge_results="",
        search_results="",
        step_results=[],
    )


@pytest.fixture
def mixed_results_state():
    return AgentState(
        messages=[HumanMessage(content="综合分析一下")],
        summary="历史摘要",
        intent="mixed",
        iterations=0,
        rewrite_query="",
        primary_intent="mixed",
        knowledge_results="知识库结果：LangGraph 是框架",
        search_results="搜索结果：LangGraph 最新发布",
        step_results=[],
    )


# ========== chat_worker tests ==========

class TestChatWorker:

    @patch("services.agent_graph.workers.chat_worker.llm")
    def test_returns_assistant_reply_without_tools(self, mock_llm, base_state):
        """chat_worker returns assistant reply without any tool calls."""
        from services.agent_graph.workers.chat_worker import _make_chat_worker

        mock_response = AIMessage(content="你好呀！很高兴见到你~")
        mock_llm.invoke.return_value = mock_response

        worker = _make_chat_worker(system_prompt="")
        result = worker(base_state)

        # Should return messages update
        assert "messages" in result
        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert msgs[0].content == "你好呀！很高兴见到你~"
        # Verify no tool calls
        assert not getattr(msgs[0], "tool_calls", None)

    @patch("services.agent_graph.workers.chat_worker.llm")
    def test_uses_system_prompt_and_summary(self, mock_llm, base_state):
        """chat_worker includes summary and system_prompt in the prompt."""
        from services.agent_graph.workers.chat_worker import _make_chat_worker

        base_state["summary"] = "用户喜欢编程"
        mock_response = AIMessage(content="好的！")
        mock_llm.invoke.return_value = mock_response

        worker = _make_chat_worker(system_prompt="记住用户喜欢 Python")
        result = worker(base_state)

        # Verify LLM was called with SystemMessage containing summary and system prompt
        call_args = mock_llm.invoke.call_args[0][0]
        assert any(isinstance(m, SystemMessage) for m in call_args)
        system_msg = [m for m in call_args if isinstance(m, SystemMessage)][0]
        assert "历史摘要" in system_msg.content
        assert "用户喜欢编程" in system_msg.content
        assert "长期记忆" in system_msg.content
        assert "记住用户喜欢 Python" in system_msg.content

    @patch("services.agent_graph.workers.chat_worker.llm")
    def test_fallback_on_exception(self, mock_llm, base_state):
        """chat_worker returns friendly fallback on LLM exception."""
        from services.agent_graph.workers.chat_worker import _make_chat_worker

        mock_llm.invoke.side_effect = Exception("LLM timeout")

        worker = _make_chat_worker(system_prompt="")
        result = worker(base_state)

        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert "抱歉" in msgs[0].content


# ========== direct_worker tests ==========

class TestDirectWorker:

    @patch("services.agent_graph.workers.direct_worker.llm")
    def test_knowledge_intent_calls_knowledge_tool(self, mock_llm, knowledge_intent_state):
        """direct_worker with knowledge intent calls knowledge tool."""
        from services.agent_graph.workers.direct_worker import _make_direct_worker

        # First call: LLM decides to call search_knowledge tool
        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "search_knowledge", "args": {"query": "LangGraph"}, "id": "tc1"}],
        )
        # Second call: LLM generates final response after tool result
        final_response = AIMessage(content="知识库里有 LangGraph 相关资料。")
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_msg, final_response]

        # Mock knowledge tool
        mock_knowledge_tool = MagicMock()
        mock_knowledge_tool.name = "search_knowledge"
        mock_knowledge_tool.invoke.return_value = "找到 3 篇 LangGraph 文档"

        mock_search_tool = MagicMock()
        mock_search_tool.name = "tavilysearch"

        tools = [mock_knowledge_tool, mock_search_tool]
        worker = _make_direct_worker(
            system_prompt="", tools=tools, enable_knowledge=True, enable_search=True
        )
        result = worker(knowledge_intent_state)

        # Verify bind_tools was called with only knowledge tools
        bind_call = mock_llm.bind_tools.call_args
        bound_tools = bind_call[0][0]
        assert len(bound_tools) == 1
        assert bound_tools[0].name == "search_knowledge"

        # Verify final response is returned
        msgs = result["messages"]
        assert any(isinstance(m, AIMessage) and m.content == "知识库里有 LangGraph 相关资料。" for m in msgs)

    @patch("services.agent_graph.workers.direct_worker.llm")
    def test_search_intent_calls_search_tool(self, mock_llm, search_intent_state):
        """direct_worker with search intent calls search tool."""
        from services.agent_graph.workers.direct_worker import _make_direct_worker

        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "tavilysearch", "args": {"query": "今天新闻"}, "id": "tc1"}],
        )
        final_response = AIMessage(content="今天的主要新闻是...")
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_msg, final_response]

        mock_knowledge_tool = MagicMock()
        mock_knowledge_tool.name = "search_knowledge"
        mock_search_tool = MagicMock()
        mock_search_tool.name = "tavilysearch"
        mock_search_tool.invoke.return_value = "新闻结果"

        tools = [mock_knowledge_tool, mock_search_tool]
        worker = _make_direct_worker(
            system_prompt="", tools=tools, enable_knowledge=True, enable_search=True
        )
        result = worker(search_intent_state)

        # Verify bind_tools was called with only search tool
        bind_call = mock_llm.bind_tools.call_args
        bound_tools = bind_call[0][0]
        assert len(bound_tools) == 1
        assert bound_tools[0].name == "tavilysearch"

    @patch("services.agent_graph.workers.direct_worker.llm")
    def test_other_intent_no_tools(self, mock_llm, base_state):
        """direct_worker with other intent uses no tools, just replies."""
        from services.agent_graph.workers.direct_worker import _make_direct_worker

        base_state["primary_intent"] = "other"
        final_response = AIMessage(content="我不太明白你的意思，能再说清楚一点吗？")
        mock_llm.invoke.return_value = final_response

        mock_knowledge_tool = MagicMock()
        mock_knowledge_tool.name = "search_knowledge"
        mock_search_tool = MagicMock()
        mock_search_tool.name = "tavilysearch"

        tools = [mock_knowledge_tool, mock_search_tool]
        worker = _make_direct_worker(
            system_prompt="", tools=tools, enable_knowledge=True, enable_search=True
        )
        result = worker(base_state)

        # Verify llm.invoke was called (not bind_tools)
        mock_llm.invoke.assert_called_once()
        mock_llm.bind_tools.assert_not_called()

        msgs = result["messages"]
        assert any(isinstance(m, AIMessage) and m.content == "我不太明白你的意思，能再说清楚一点吗？" for m in msgs)


# ========== knowledge_worker tests ==========

class TestKnowledgeWorker:

    @patch("services.agent_graph.workers.knowledge_worker.llm")
    def test_writes_to_knowledge_results(self, mock_llm, knowledge_intent_state):
        """knowledge_worker writes raw result text to state["knowledge_results"]."""
        from services.agent_graph.workers.knowledge_worker import _make_knowledge_worker

        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "search_knowledge", "args": {"query": "LangGraph"}, "id": "tc1"}],
        )
        final_response = AIMessage(content="找到 3 篇 LangGraph 文档")
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_msg, final_response]

        mock_knowledge_tool = MagicMock()
        mock_knowledge_tool.name = "search_knowledge"
        mock_knowledge_tool.invoke.return_value = "找到 3 篇 LangGraph 文档：1. 入门指南..."

        mock_list_tool = MagicMock()
        mock_list_tool.name = "list_knowledge"

        tools = [mock_knowledge_tool, mock_list_tool]
        worker = _make_knowledge_worker(
            system_prompt="", user_id="user123", enable_knowledge=True
        )
        # Patch make_tools to return our mocked tools
        with patch("services.agent_graph.workers.knowledge_worker.make_tools", return_value=tools):
            result = worker(knowledge_intent_state)

        # Verify knowledge_results is written
        assert "knowledge_results" in result
        assert "找到 3 篇 LangGraph 文档" in result["knowledge_results"]

    @patch("services.agent_graph.workers.knowledge_worker.llm")
    def test_disabled_knowledge_returns_friendly_message(self, mock_llm, knowledge_intent_state):
        """knowledge_worker returns friendly message when enable_knowledge=False."""
        from services.agent_graph.workers.knowledge_worker import _make_knowledge_worker

        worker = _make_knowledge_worker(
            system_prompt="", user_id="user123", enable_knowledge=False
        )
        result = worker(knowledge_intent_state)

        assert "messages" in result
        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert "知识库" in msgs[0].content or "未开启" in msgs[0].content or "不可用" in msgs[0].content

    @patch("services.agent_graph.workers.knowledge_worker.llm")
    def test_max_two_iterations(self, mock_llm, knowledge_intent_state):
        """knowledge_worker limits ReAct loop to max 2 iterations."""
        from services.agent_graph.workers.knowledge_worker import _make_knowledge_worker

        # Always return tool call (simulating infinite loop tendency)
        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "search_knowledge", "args": {"query": "x"}, "id": "tc1"}],
        )
        mock_llm.bind_tools.return_value.invoke.return_value = tool_call_msg

        mock_knowledge_tool = MagicMock()
        mock_knowledge_tool.name = "search_knowledge"
        mock_knowledge_tool.invoke.return_value = "结果"

        tools = [mock_knowledge_tool]
        worker = _make_knowledge_worker(
            system_prompt="", user_id="user123", enable_knowledge=True
        )
        with patch("services.agent_graph.workers.knowledge_worker.make_tools", return_value=tools):
            result = worker(knowledge_intent_state)

        # Should have called invoke at most 2 times (initial + 1 retry)
        assert mock_llm.bind_tools.return_value.invoke.call_count <= 2


# ========== search_worker tests ==========

class TestSearchWorker:

    @patch("services.agent_graph.workers.search_worker.llm")
    def test_writes_to_search_results(self, mock_llm, search_intent_state):
        """search_worker writes raw result text to state["search_results"]."""
        from services.agent_graph.workers.search_worker import _make_search_worker

        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "tavilysearch", "args": {"query": "今天新闻"}, "id": "tc1"}],
        )
        final_response = AIMessage(content="搜索完成")
        mock_llm.bind_tools.return_value.invoke.side_effect = [tool_call_msg, final_response]

        mock_search_tool = MagicMock()
        mock_search_tool.name = "tavilysearch"
        mock_search_tool.invoke.return_value = "今天新闻：1. AI 突破... 2. 科技动态..."

        tools = [mock_search_tool]
        worker = _make_search_worker(
            system_prompt="", user_id="user123", enable_search=True
        )
        with patch("services.agent_graph.workers.search_worker.make_tools", return_value=tools):
            result = worker(search_intent_state)

        assert "search_results" in result
        assert "今天新闻" in result["search_results"]

    @patch("services.agent_graph.workers.search_worker.llm")
    def test_disabled_search_returns_friendly_message(self, mock_llm, search_intent_state):
        """search_worker returns friendly message when enable_search=False."""
        from services.agent_graph.workers.search_worker import _make_search_worker

        worker = _make_search_worker(
            system_prompt="", user_id="user123", enable_search=False
        )
        result = worker(search_intent_state)

        assert "messages" in result
        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert "搜索" in msgs[0].content or "未开启" in msgs[0].content or "不可用" in msgs[0].content

    @patch("services.agent_graph.workers.search_worker.llm")
    def test_max_two_iterations(self, mock_llm, search_intent_state):
        """search_worker limits ReAct loop to max 2 iterations."""
        from services.agent_graph.workers.search_worker import _make_search_worker

        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "tavilysearch", "args": {"query": "x"}, "id": "tc1"}],
        )
        mock_llm.bind_tools.return_value.invoke.return_value = tool_call_msg

        mock_search_tool = MagicMock()
        mock_search_tool.name = "tavilysearch"
        mock_search_tool.invoke.return_value = "结果"

        tools = [mock_search_tool]
        worker = _make_search_worker(
            system_prompt="", user_id="user123", enable_search=True
        )
        with patch("services.agent_graph.workers.search_worker.make_tools", return_value=tools):
            result = worker(search_intent_state)

        assert mock_llm.bind_tools.return_value.invoke.call_count <= 2


# ========== synthesis_worker tests ==========

class TestSynthesisWorker:

    @patch("services.agent_graph.workers.synthesis_worker.llm")
    def test_integrates_results_and_returns_final_reply(self, mock_llm, mixed_results_state):
        """synthesis_worker integrates knowledge and search results into final reply."""
        from services.agent_graph.workers.synthesis_worker import _make_synthesis_worker

        mock_response = AIMessage(content="综合结果：LangGraph 是框架，最新发布了...")
        mock_llm.invoke.return_value = mock_response

        worker = _make_synthesis_worker(system_prompt="")
        result = worker(mixed_results_state)

        assert "messages" in result
        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert msgs[0].content == "综合结果：LangGraph 是框架，最新发布了..."

    @patch("services.agent_graph.workers.synthesis_worker.llm")
    def test_includes_results_in_prompt(self, mock_llm, mixed_results_state):
        """synthesis_worker includes knowledge_results and search_results in prompt."""
        from services.agent_graph.workers.synthesis_worker import _make_synthesis_worker

        mock_response = AIMessage(content="综合结果")
        mock_llm.invoke.return_value = mock_response

        worker = _make_synthesis_worker(system_prompt="")
        result = worker(mixed_results_state)

        call_args = mock_llm.invoke.call_args[0][0]
        system_msg = [m for m in call_args if isinstance(m, SystemMessage)][0]
        assert "知识库结果" in system_msg.content or "knowledge_results" in system_msg.content
        assert "搜索结果" in system_msg.content or "search_results" in system_msg.content

    @patch("services.agent_graph.workers.synthesis_worker.llm")
    def test_handles_conflicting_results(self, mock_llm):
        """synthesis_worker handles conflicting knowledge and search results."""
        from services.agent_graph.workers.synthesis_worker import _make_synthesis_worker

        state = AgentState(
            messages=[HumanMessage(content="分析一下")],
            summary="",
            intent="mixed",
            iterations=0,
            rewrite_query="",
            primary_intent="mixed",
            knowledge_results="知识库：Python 3.8 最新",
            search_results="搜索：Python 3.12 最新",
            step_results=[],
        )
        mock_response = AIMessage(content="根据知识库，Python 3.8 最新；但搜索显示 Python 3.12 已发布。可能存在信息冲突。")
        mock_llm.invoke.return_value = mock_response

        worker = _make_synthesis_worker(system_prompt="")
        result = worker(state)

        msgs = result["messages"]
        assert isinstance(msgs[0], AIMessage)
        # The prompt should mention conflict handling
        call_args = mock_llm.invoke.call_args[0][0]
        system_msg = [m for m in call_args if isinstance(m, SystemMessage)][0]
        assert "冲突" in system_msg.content or "优先" in system_msg.content or "disagree" in system_msg.content.lower()

    @patch("services.agent_graph.workers.synthesis_worker.llm")
    def test_fallback_on_exception(self, mock_llm, mixed_results_state):
        """synthesis_worker returns friendly fallback on LLM exception."""
        from services.agent_graph.workers.synthesis_worker import _make_synthesis_worker

        mock_llm.invoke.side_effect = Exception("LLM error")

        worker = _make_synthesis_worker(system_prompt="")
        result = worker(mixed_results_state)

        msgs = result["messages"]
        assert len(msgs) == 1
        assert isinstance(msgs[0], AIMessage)
        assert "抱歉" in msgs[0].content

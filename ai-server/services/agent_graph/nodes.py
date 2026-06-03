"""所有 LangGraph 节点函数。

职责：实现 Graph 中每个节点的具体逻辑，包括：
      - 意图识别（intent_node）
      - 查询改写（query_rewrite_node）
      - 闲聊生成（chat_node）
      - Agent 推理（agent_node）
      - 摘要生成（summarize_node + _generate_summary）
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from services.llm.llm import llm, summary_llm

from .prompts import (
    CHAT_SYSTEM_PROMPT,
    INTENT_SYSTEM_PROMPT,
    REWRITE_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_system_prompt,
)
from .state import MAX_RAW_MESSAGES, AgentState


# ========== 意图识别节点 ==========

def intent_node(state: AgentState) -> dict:
    """意图识别节点：分类用户意图，决定后续执行路径。

    同时重置 iterations 计数器，确保每轮新对话从零开始。
    """
    messages = state["messages"]
    if not messages:
        return {"intent": "other", "iterations": 0}

    last_message = messages[-1]
    if not hasattr(last_message, "content") or not last_message.content:
        return {"intent": "other", "iterations": 0}

    # 提取文本内容（支持多模态消息）
    content = last_message.content
    if isinstance(content, list):
        text_parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        content = " ".join(text_parts) or str(content)

    prompt = f"{INTENT_SYSTEM_PROMPT}\n\n用户消息：{content}\n\n意图标签："

    try:
        # 关键：传入空 callbacks，阻断 graph stream 的旁路捕获，防止意图标签泄漏到前端
        response = llm.invoke(
            [HumanMessage(content=prompt)],
            config=RunnableConfig(callbacks=[]),
        )
        intent = response.content.strip().lower()
    except Exception as e:
        print(f"[AGENT] 意图识别异常: {e}")
        intent = "other"

    # 验证并规范化
    valid_intents = {"chat", "knowledge", "search", "mixed", "other"}
    intent = intent if intent in valid_intents else "other"

    print(f"[AGENT] 意图识别: '{content[:40]}...' → {intent}")
    return {"intent": intent, "iterations": 0}


# ========== 查询改写节点 ==========

def query_rewrite_node(state: AgentState) -> dict:
    """查询改写节点：将用户问题改写为更适合向量检索的查询。

    仅在 intent 为 knowledge 时触发。改写结果存入 state.rewrite_query，
    后续 agent_node 会在 system prompt 中注入改写建议。
    """
    messages = state["messages"]
    if not messages:
        return {"rewrite_query": ""}

    last_message = messages[-1]
    if not hasattr(last_message, "content") or not last_message.content:
        return {"rewrite_query": ""}

    content = last_message.content
    if isinstance(content, list):
        text_parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        content = " ".join(text_parts) or str(content)

    prompt = f"{REWRITE_SYSTEM_PROMPT}\n\n用户原始问题：{content}\n\n改写后的查询："

    try:
        # 关键：传入空 callbacks，阻断 graph stream 的旁路捕获，防止改写查询泄漏到前端
        response = llm.invoke(
            [HumanMessage(content=prompt)],
            config=RunnableConfig(callbacks=[]),
        )
        rewrite = response.content.strip()
    except Exception as e:
        print(f"[AGENT] 查询改写异常: {e}")
        rewrite = ""

    print(f"[AGENT] 查询改写: '{content[:40]}...' → '{rewrite[:50]}...'")
    return {"rewrite_query": rewrite}


# ========== 闲聊节点 ==========

def _make_chat_node(system_prompt: str = ""):
    """创建闲聊专用节点的工厂。

    闲聊不走工具路径，直接调用裸 LLM 生成回复，节省 token 和延迟。
    """

    def chat_node(state: AgentState) -> dict:
        """闲聊节点：不绑定工具，直接生成友好回复。"""
        messages = state["messages"]
        summary = state.get("summary", "")

        # 组装 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(CHAT_SYSTEM_PROMPT)
        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        # 只取最近消息（闲聊通常不需要很长的历史）
        recent_messages = messages[-MAX_RAW_MESSAGES:]
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        try:
            response = llm.invoke(prompt_messages)
        except Exception as e:
            print(f"[AGENT] 闲聊节点异常: {e}")
            response = AIMessage(content="抱歉，我暂时有点忙，请稍后再试~")

        print(f"[AGENT] 闲聊节点生成回复: {len(response.content)} 字")
        return {"messages": [response]}

    return chat_node


# ========== Agent 推理节点 ==========

def _make_agent_node(
    enable_knowledge: bool, enable_search: bool, system_prompt: str, tools: list
):
    """创建 agent 节点的工厂函数。

    使用闭包捕获构建时的配置参数（工具列表、提示词等），
    避免每次节点执行时重复计算。
    """
    # 预构建基础 system prompt（只需计算一次）
    base_prompt = build_system_prompt(enable_knowledge, enable_search)

    # 预绑定工具（只需绑定一次）
    llm_with_tools = llm.bind_tools(tools) if tools else None

    def agent_node(state: AgentState) -> dict:
        """Agent 节点：动态构建 prompt 并调用 LLM。

        每次执行时按以下顺序动态拼接 system prompt：
          1. 基础系统提示词（工具说明、回答规则）
          2. 查询改写建议（如果 state.rewrite_query 存在）
          3. 长期记忆（外部传入的 system_prompt 参数）
          4. 会话摘要（由 summarize 节点自动生成，可能为空）
          5. 最近 N 条原始消息（避免上下文溢出）
        """
        messages = state["messages"]
        summary = state.get("summary", "")
        rewrite_query = state.get("rewrite_query", "")

        # 1. 组装完整 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(base_prompt)

        # 注入查询改写建议（如果有）
        if rewrite_query:
            parts.append(
                f"## 查询优化建议\n"
                f"为获取更准确的检索结果，建议以以下语义进行搜索：'{rewrite_query}'\n"
                f"请在调用 search_knowledge 时参考此改写。"
            )

        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        # 2. 只取最近 N 条消息传入 LLM（滑动窗口）
        recent_messages = messages[-MAX_RAW_MESSAGES:]

        # 3. 构建完整消息列表：system + 近期对话
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        # 4. 调用 LLM（预绑定的工具实例或裸 LLM）
        def _invoke_llm(msgs, use_tools=True):
            if use_tools and llm_with_tools:
                return llm_with_tools.invoke(msgs)
            return llm.invoke(msgs)

        try:
            response = _invoke_llm(prompt_messages, use_tools=True)
        except Exception as e:
            error_msg = str(e)
            print(f"[AGENT] LLM 调用异常: {error_msg}")
            # Fallback 1：bind_tools 失败，尝试裸 LLM
            if llm_with_tools:
                try:
                    print("[AGENT] Fallback 1: 尝试裸 LLM...")
                    response = _invoke_llm(prompt_messages, use_tools=False)
                    print("[AGENT] Fallback 1 成功")
                except Exception as e2:
                    print(f"[AGENT] Fallback 1 失败: {e2}")
                    # Fallback 2：移除 ToolMessage 后重试
                    try:
                        from langchain_core.messages import ToolMessage

                        msgs_without_tools = [
                            m for m in prompt_messages if not isinstance(m, ToolMessage)
                        ]
                        if len(msgs_without_tools) < len(prompt_messages):
                            print("[AGENT] Fallback 2: 移除 ToolMessage 后重试...")
                            response = llm.invoke(msgs_without_tools)
                            print("[AGENT] Fallback 2 成功")
                        else:
                            raise RuntimeError("无 ToolMessage 可移除")
                    except Exception as e3:
                        print(f"[AGENT] Fallback 2 失败: {e3}")
                        response = AIMessage(
                            content="抱歉，生成回复时遇到内容安全限制，请换个方式提问或稍后重试。"
                        )
            else:
                response = AIMessage(content="抱歉，服务暂时异常，请稍后重试。")

        # 5. 打印工具调用决策
        tool_calls = getattr(response, "tool_calls", None)
        if tool_calls:
            called = [tc.get("name") for tc in tool_calls if tc]
            available = [t.name for t in tools]
            print(f"[AGENT] LLM 决定调用工具: {called}")
        else:
            print("[AGENT] LLM 未调用工具，直接生成回复")

        # 6. 返回状态更新
        return {"messages": [response]}

    return agent_node


# ========== 摘要节点 ==========

def summarize_node(state: AgentState) -> dict:
    """摘要节点：对超出的历史消息生成摘要。

    触发条件：checkpoint 中的 messages 数量超过 MAX_RAW_MESSAGES
    行为：
      - 取较早的消息生成摘要
      - 与已有摘要合并（增量更新）
      - 更新 state.summary 字段
    注意：不删除原始消息，checkpoint 保留完整历史；
          上下文截断在 agent 节点中通过滑动窗口实现。
    """
    messages = state["messages"]
    existing_summary = state.get("summary", "")

    # 需要被摘要的消息（除最近 N 条外的所有）
    to_summarize = messages[:-MAX_RAW_MESSAGES]

    # 生成新摘要
    summary = _generate_summary(to_summarize, existing_summary)

    print(f"[AGENT] 生成摘要: {len(to_summarize)} 条消息 → {len(summary)} 字摘要")

    # 只更新 summary 字段，messages 保持不变
    return {"summary": summary}


def _generate_summary(messages: list, existing_summary: str = "") -> str:
    """调用 LLM 生成对话摘要。

    Args:
        messages: 需要被摘要的原始消息列表（较早的对话）
        existing_summary: 已有的历史摘要（增量更新时使用）

    Returns:
        生成的摘要文本
    """
    # 将消息格式化为易读的对话文本
    dialog_lines = []
    for msg in messages:
        if not hasattr(msg, "content") or not msg.content:
            continue
        role = "用户" if msg.type == "human" else "助手"
        # 截断过长的单条消息，避免摘要 prompt 过大
        content = str(msg.content)[:500]
        dialog_lines.append(f"{role}: {content}")

    dialog_text = "\n".join(dialog_lines)

    # 构建摘要请求 prompt
    prompt_parts = [SUMMARY_SYSTEM_PROMPT]
    if existing_summary:
        prompt_parts.append(f"\n【已有摘要】\n{existing_summary}")
    prompt_parts.append(f"\n【新增对话】\n{dialog_text}\n\n【更新后的完整摘要】")

    prompt = "\n".join(prompt_parts)

    # 调用非流式 LLM 生成摘要
    response = summary_llm.invoke(
        [HumanMessage(content=prompt)],
        config=RunnableConfig(callbacks=[]),
    )
    return response.content.strip()

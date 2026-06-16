"""所有 LangGraph 条件路由函数。

职责：根据当前 state 决定 Graph 的下一步走向。

注意：旧路由函数 _make_analyze_router 和 _make_agent_router 已被 supervisor_router、
plan_executor_router、quality_router、refinement_router 替代，保留在此仅作向后兼容参考。
"""

from langgraph.graph import END

from .state import MAX_ITERATIONS, MAX_RAW_MESSAGES, AgentState


# ========== 旧分析后路由（已废弃，保留参考） ==========

def _make_analyze_router():
    """【已废弃】创建分析后路由函数的工厂。

    原 analyze_node 同时完成了意图识别 + 查询改写，路由逻辑简化：
      - chat  → chat_node（不走工具，直接闲聊回复）
      - 其他  → agent_node（带工具的 ReAct 循环）

    现已被 supervisor_router 替代，supervisor 支持多意图识别和复杂度评估。
    """

    def analyze_router(state: AgentState) -> str:
        intent = state.get("intent", "other")

        if intent == "chat":
            print(f"[AGENT] 分析路由 → chat_node（闲聊模式）")
            return "chat"

        print(f"[AGENT] 分析路由 → agent_node（Agent 模式, intent={intent}）")
        return "agent"

    return analyze_router


# ========== 旧 Agent 后路由（已废弃，保留参考） ==========

def _make_agent_router(tools: list):
    """【已废弃】创建 agent 路由函数的工厂（捕获 tools 列表用于日志对比）。

    原 agent 节点后的统一路由函数，现已被 plan_executor_router 和 quality_router 替代。
    """
    all_tool_names = [t.name for t in tools]

    def agent_router(state: AgentState) -> str:
        """Agent 节点后的统一路由函数。

        按优先级判断下一步走向：
          1. 迭代次数超过 MAX_ITERATIONS → 强制结束（防止无限循环）
          2. 最后一条消息包含 tool_calls → 需要执行工具
          3. 消息总数超过阈值 → 需要生成摘要
          4. 否则 → 流程结束
        """
        last_message = state["messages"][-1]
        iterations = state.get("iterations", 0)

        # 优先级 0：迭代保护（硬限制，最高优先级）
        if iterations >= MAX_ITERATIONS:
            print(
                f"[AGENT] 路由 → END: 迭代次数 {iterations} 达到上限 {MAX_ITERATIONS}，强制结束"
            )
            return END

        # 优先级 1：模型要求调用工具
        tool_calls = getattr(last_message, "tool_calls", None)
        if tool_calls and all_tool_names:
            called_names = {tc.get("name") for tc in tool_calls if tc}
            uncalled = [n for n in all_tool_names if n not in called_names]
            print(
                f"[AGENT] 路由 → tools: 本轮调用 {sorted(called_names)}, 闲置 {uncalled}"
            )
            return "tools"
        if tool_calls:
            print(f"[AGENT] 路由 → tools: 模型要求调用工具，但当前无可用工具")
            return "tools"

        # 优先级 2：历史消息过多，需要摘要
        msg_count = len(state["messages"])
        if msg_count > MAX_RAW_MESSAGES:
            print(
                f"[AGENT] 路由 → summarize: 消息数 {msg_count} > 阈值 {MAX_RAW_MESSAGES}"
            )
            return "summarize"

        print(f"[AGENT] 路由 → END: 消息数 {msg_count}, 无需工具/摘要")
        return END

    return agent_router

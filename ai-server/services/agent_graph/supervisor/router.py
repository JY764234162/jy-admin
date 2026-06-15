"""Supervisor 路由器：根据意图分析结果决定下一步走向。"""

from ..state import AgentState


def supervisor_router(state: AgentState) -> str:
    """根据 Supervisor 节点的意图分析结果路由到对应工作节点。

    路由规则：
      - "chat_worker": primary_intent == "chat" 且 task_complexity == "simple"
      - "direct_worker": task_complexity == "simple" 且只有一个非 chat 意图
      - "planner_node": task_complexity 为 moderate/complex 或 intents 数量 > 1
    """
    primary_intent = state.get("primary_intent", "other")
    task_complexity = state.get("task_complexity", "simple")
    intents = state.get("intents", [])

    # 规则 1: 纯闲聊且简单 → 直接走 chat_worker
    if primary_intent == "chat" and task_complexity == "simple":
        print(f"[SUPERVISOR] 路由 → chat_worker（闲聊模式）")
        return "chat_worker"

    # 规则 3: 复杂任务或多意图 → 走 planner_node
    if task_complexity in ("moderate", "complex") or len(intents) > 1:
        print(f"[SUPERVISOR] 路由 → planner_node（复杂度={task_complexity}, 意图数={len(intents)}）")
        return "planner_node"

    # 规则 2: 简单任务且只有一个非 chat 意图 → 直接执行（direct_worker）
    print(f"[SUPERVISOR] 路由 → direct_worker（直接执行, intent={primary_intent}）")
    return "direct_worker"

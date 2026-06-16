"""Plan Executor：执行计划中的步骤。

职责：根据 plan 和 step_results 决定下一步可执行的步骤，
      调用对应 worker 执行，并记录结果。
"""

import logging
from copy import deepcopy
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage

from ..message_helpers import extract_text_content, last_human_message
from ..state import AgentState, StepResult
from ..workers import (
    _make_chat_worker,
    _make_knowledge_worker,
    _make_search_worker,
    _make_synthesis_worker,
)

logger = logging.getLogger(__name__)


def _get_step_status(step_id: str, step_results: list[StepResult], plan: list = None) -> str:
    """获取指定步骤的执行状态。"""
    # 先检查 step_id 是否在 plan 中存在
    if plan is not None:
        plan_step_ids = {s.step_id for s in plan}
        if step_id not in plan_step_ids:
            logger.warning(f"[EXECUTOR] 依赖步骤 {step_id} 不存在于计划中，视为 failed")
            return "failed"
    for sr in step_results:
        if sr.step_id == step_id:
            return sr.status
    return "pending"


def _find_next_executable_step(state: AgentState) -> tuple[int, Optional[dict]]:
    """找到下一个可执行的步骤。

    可执行条件：所有 depends_on 中的步骤状态均为 "success" 或依赖不存在（视为 failed，已处理）。

    Returns:
        (step_index, step_data) 或 (-1, None) 如果没有可执行步骤。
    """
    plan = state.get("plan", [])
    step_results = state.get("step_results", [])
    current_index = state.get("current_step_index", 0)

    for i in range(current_index, len(plan)):
        step = plan[i]
        deps = step.depends_on if step.depends_on else []

        all_deps_success = True
        for dep_id in deps:
            status = _get_step_status(dep_id, step_results, plan)
            if status != "success":
                all_deps_success = False
                break

        if all_deps_success:
            return i, step

    return -1, None


def _has_executable_step(state: AgentState) -> bool:
    """检查是否还有任何可执行的步骤（依赖满足或不存在）。"""
    plan = state.get("plan", [])
    step_results = state.get("step_results", [])
    current_index = state.get("current_step_index", 0)

    for i in range(current_index, len(plan)):
        step = plan[i]
        deps = step.depends_on if step.depends_on else []

        all_deps_success = True
        for dep_id in deps:
            status = _get_step_status(dep_id, step_results, plan)
            if status != "success":
                all_deps_success = False
                break

        if all_deps_success:
            return True

    return False


def _make_plan_executor(
    tools: list,
    system_prompt: str,
    enable_knowledge: bool,
    enable_search: bool,
):
    """创建计划执行器。

    Args:
        tools: 可用工具列表。
        system_prompt: 系统提示词。
        enable_knowledge: 是否启用知识库。
        enable_search: 是否启用搜索。

    Returns:
        plan_executor(state) -> dict 函数。
    """

    # 预创建 worker 工厂
    worker_factories = {
        "knowledge_worker": lambda: _make_knowledge_worker(system_prompt, tools, enable_knowledge),
        "search_worker": lambda: _make_search_worker(system_prompt, tools, enable_search),
        "chat_worker": lambda: _make_chat_worker(system_prompt),
        "synthesis_worker": lambda: _make_synthesis_worker(system_prompt),
    }

    def plan_executor(state: AgentState) -> dict:
        """执行计划中的一个步骤。

        1. 找到下一个可执行步骤。
        2. 实例化对应 worker。
        3. 调用 worker 执行。
        4. 记录 StepResult。
        5. 更新 current_step_index。
        """
        plan = state.get("plan", [])
        step_results = list(state.get("step_results", []))
        current_index = state.get("current_step_index", 0)
        new_execution_count = state.get("plan_execution_count", 0) + 1

        if not plan or current_index >= len(plan):
            logger.info("[EXECUTOR] 所有步骤已执行完毕")
            return {
                "messages": [],
                "step_results": step_results,
                "current_step_index": current_index,
                "plan_execution_count": new_execution_count,
            }

        step_idx, step = _find_next_executable_step(state)
        if step_idx == -1 or step is None:
            logger.warning("[EXECUTOR] 没有可执行的步骤（依赖未满足）")
            return {
                "messages": [],
                "step_results": step_results,
                "current_step_index": current_index,
                "plan_execution_count": new_execution_count,
            }

        worker_name = step.worker
        step_id = step.step_id
        input_query = step.input_query

        logger.info(
            "[EXECUTOR] 执行步骤 %s: %s",
            step_id,
            worker_name,
            extra={"node": "plan_executor", "step_id": step_id, "worker": worker_name},
        )

        # 准备 worker 输入状态
        # 对于 chat_worker 和 synthesis_worker，将 input_query 作为最后一条人类消息
        worker_state = deepcopy(dict(state))
        if worker_name in ("chat_worker", "synthesis_worker"):
            messages = list(worker_state.get("messages", []))
            # 只替换最后一条人类消息，保留其他人类消息
            new_messages = []
            last_human_replaced = False
            for msg in reversed(messages):
                if getattr(msg, "type", "") == "human" and not last_human_replaced:
                    last_human_replaced = True
                    continue
                new_messages.append(msg)
            new_messages.reverse()
            new_messages.append(HumanMessage(content=input_query))
            worker_state["messages"] = new_messages

        # 实例化 worker
        factory = worker_factories.get(worker_name)
        if factory is None:
            logger.error(f"[EXECUTOR] 未知 worker 类型: {worker_name}")
            step_result = StepResult(
                step_id=step_id,
                worker=worker_name,
                output=f"未知 worker 类型: {worker_name}",
                status="failed",
            )
            step_results.append(step_result)
            return {
                "messages": [],
                "step_results": step_results,
                "current_step_index": step_idx + 1,
                "plan_execution_count": new_execution_count,
            }

        worker = factory()

        # 执行 worker
        try:
            worker_result = worker(worker_state)
        except Exception as e:
            logger.error(f"[EXECUTOR] 步骤 {step_id} 执行异常: {e}", exc_info=True)
            step_result = StepResult(
                step_id=step_id,
                worker=worker_name,
                output=f"执行异常: {str(e)}",
                status="failed",
            )
            step_results.append(step_result)
            return {
                "messages": [],
                "step_results": step_results,
                "current_step_index": step_idx + 1,
                "plan_execution_count": new_execution_count,
            }

        # 提取 worker 输出
        output_text = ""
        if "messages" in worker_result:
            msgs = worker_result["messages"]
            if msgs:
                # 取最后一条 AI 消息的内容
                for msg in reversed(msgs):
                    if getattr(msg, "type", "") in ("ai", "assistant"):
                        output_text = extract_text_content(msg)
                        break
                if not output_text:
                    output_text = extract_text_content(msgs[-1])

        # 记录成功结果
        step_result = StepResult(
            step_id=step_id,
            worker=worker_name,
            output=output_text or "执行完成",
            status="success",
        )
        step_results.append(step_result)

        logger.info(
            "[EXECUTOR] 步骤 %s 完成: %s...",
            step_id,
            output_text[:50],
            extra={"node": "plan_executor", "step_id": step_id, "worker": worker_name, "status": "success"},
        )

        # 合并 worker 的 messages 更新 + 状态更新
        result = dict(worker_result)
        result["step_results"] = step_results
        result["current_step_index"] = step_idx + 1
        result["plan_execution_count"] = new_execution_count
        return result

    return plan_executor


def plan_executor_router(state: AgentState) -> str:
    """路由函数：决定下一步走向。

    - 如果还有未执行的步骤且至少一个可执行，返回 "plan_executor"。
    - 如果所有步骤已完成或无法继续（死锁/循环超限），返回 "synthesis_worker"。
    """
    plan = state.get("plan", [])
    current_index = state.get("current_step_index", 0)
    plan_execution_count = state.get("plan_execution_count", 0)

    if not plan:
        return "synthesis_worker"

    if current_index >= len(plan):
        return "synthesis_worker"

    # 安全限制：如果执行循环超过阈值，强制结束
    if plan_execution_count >= 10:
        logger.warning("[ROUTER] 计划执行循环超过限制，强制进入 synthesis_worker")
        return "synthesis_worker"

    # 死锁检测：检查是否还有可执行的步骤
    if not _has_executable_step(state):
        logger.warning("[ROUTER] 无可用步骤（依赖死锁），进入 synthesis_worker")
        return "synthesis_worker"

    return "plan_executor"

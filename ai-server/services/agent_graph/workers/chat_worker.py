"""Chat Worker：纯闲聊，无工具调用。

职责：处理纯闲聊类消息，直接调用 LLM 生成友好回复，不走工具路径。
"""

from langchain_core.messages import AIMessage, SystemMessage

from services.llm.llm import llm

from ..message_helpers import build_assistant_reply_update, messages_for_llm_prompt
from ..prompts import CHAT_WORKER_PROMPT
from ..state import MAX_RAW_MESSAGES, AgentState


def _make_chat_worker(system_prompt: str = ""):
    """创建闲聊专用 worker 的工厂。

    闲聊不走工具路径，直接调用裸 LLM 生成回复，节省 token 和延迟。
    """

    def chat_worker(state: AgentState) -> dict:
        """闲聊 worker：不绑定工具，直接生成友好回复。"""
        messages = state["messages"]
        summary = state.get("summary", "")

        # 组装 system prompt
        parts = []
        if summary:
            parts.append(f"## 历史摘要\n{summary}")
        parts.append(CHAT_WORKER_PROMPT)
        if system_prompt:
            parts.append(f"## 长期记忆\n{system_prompt}")
        full_system = "\n\n".join(parts)

        recent_messages = messages_for_llm_prompt(messages, limit=MAX_RAW_MESSAGES)
        prompt_messages = [SystemMessage(content=full_system)] + recent_messages

        try:
            response = llm.invoke(prompt_messages)
        except Exception as e:
            print(f"[AGENT] 闲聊 worker 异常: {e}")
            response = AIMessage(content="抱歉，我暂时有点忙，请稍后再试~")

        print(f"[AGENT] 闲聊 worker 生成回复: {len(response.content)} 字")
        return build_assistant_reply_update(messages, response)

    return chat_worker

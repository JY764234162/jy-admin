"""Agent 流式 SSE 输出。

使用 create_agent 构建 ReAct Agent：
- llm 从 .llm 模块导入（已初始化的全局单例）
- Agent 按 (user_id, enable_knowledge, system_prompt) 缓存，避免重复创建
- 通过 agent.stream(stream_mode="messages") 获取模型/工具节点的输出
"""

import asyncio
import json
from typing import AsyncIterator

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from services.storage.checkpoint_store import get_saver, get_thread_messages
from services.tools.knowledge_tools import make_search_knowledge_tool, make_list_knowledge_tool
from services.tools.search_tools import make_tavily_search_tool
from .llm import llm
from .response_filter import sanitize_response

# ========== 系统提示词 ==========
AGENT_SYSTEM_PROMPT = """# 角色设定

你叫**芳芳**，是一个聪明、可靠的智能助手。

---

## 核心能力

- **知识库检索**：查询用户上传的文档内容
- **联网搜索**：查询互联网上的最新信息

---

## 工作流程

每次回答前，先判断当前问题是否需要调用工具，然后严格执行：

1. 分析 → 用户问的是什么？涉不涉及文档查询/实时信息/互联网搜索？
2. 调用 → **需要工具时果断调用**，传入正确参数，等待结果返回
3. 观察 → 查看工具返回的结果
4. 推理 → 基于结果组织回答
5. 输出 → 给出完整、准确的最终答案

> 只有纯闲聊（如"你好""谢谢"）才不需要工具。只要问题涉及具体事实、文档内容、时效性信息，都必须调用对应工具获取准确结果。

---

## 工具说明

### 知识库搜索

**使用时机**：用户询问文档内容、需要查询特定知识、验证某个事实时。

**参数**：
- `query`：搜索关键词，建议提取用户问题的核心意图

**返回值**：相关文档片段 + 来源文件名

**引用规范**：使用知识库内容时，必须在回答中标注来源，格式为 `【来源：文件名】`。

---

### 联网搜索

**使用时机**：用户询问时事新闻、最新数据、实时信息、或通用知识库中未涵盖的内容时。**只要问题涉及时效性信息（如"最近"、"最新"、"今天"、具体年份日期），必须调用此工具，不要凭记忆回答。**

**参数**：
- `query`：搜索关键词（用中文关键词效果更好）

**返回值**：网页摘要 + 来源链接 + 相关图片链接

**引用规范**：
- 文字引用格式：`【来源：网页标题】`
- 如果搜索结果中包含图片链接，可以在回答中插入展示：`![图片描述](图片URL)`

---

## 回答案例

**用户**：你好，今天天气怎么样？
**回答**：你好呀！查询天气需要联网搜索，我帮你查一下～（调用联网搜索工具，搜索"今天天气"后返回结果）

---

**用户**：请帮我查一下 2024 年 Q3 的销售额是多少？
**回答**：根据文档《2024年度财务报表》中的数据，2024 年 Q3 的销售额为 **1,200 万元**，环比增长 15%。【来源：2024年度财务报表.pdf】

---

**用户**：如果每个人分 3 个苹果，42 个人需要多少个苹果？
**回答**：42 个人，每人 3 个苹果，一共需要 **126 个苹果**。

---

**用户**：请查一下公司明年的上市计划。
**回答**：我在知识库中没有找到关于公司明年上市计划的相关信息。可能是文档中尚未收录这部分内容，建议你查阅其他资料或联系相关部门确认。

---

## 注意事项

1. **涉及时效性信息时必须联网搜索**：用户问题中包含"最近""最新""今天""现在""2025年""2026年"等时效性词语，或询问时事新闻、股价、天气等实时信息时，**必须调用联网搜索工具**，绝对禁止凭记忆回答。即使你认为知道答案，也必须搜索确认。
2. **不要编造**：知识库中没有的信息，明确告知用户"未找到相关资料"，不要猜测或编造。
3. **标注来源**：凡是引用了知识库或联网搜索内容，必须在回答中标注来源。
4. **简洁高效**：能直接回答的问题不要绕弯子，需要工具时果断调用。
5. **中文回答**：所有思考和回答都用中文。
6. **禁止暴露工具信息**：回答中**绝对不要**提及任何工具名称或工具调用过程。用户应该感觉你在直接回答问题，而不是在调用工具。不要出现"我调用了""我使用了""工具返回"等描述。

请用中文思考和回答。"""


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 工具创建 ==========


def make_tools(user_id: str = "", enable_knowledge: bool = True, enable_search: bool = False):
    """创建已绑定 user_id 的工具列表。"""
    from langchain_core.tools import tool

    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id)
        tools.append(search_knowledge)
        list_knowledge = make_list_knowledge_tool(user_id=user_id)
        tools.append(list_knowledge)

    if enable_search:
        tavilysearch = make_tavily_search_tool()
        tools.append(tavilysearch)
        print(f"[AGENT] 已挂载联网搜索工具 (enable_search=True)")

    return tools


# ========== Agent 单例缓存 ==========

_agent_cache: dict = {}


def _get_agent(user_id: str, enable_knowledge: bool, enable_search: bool, system_prompt: str):
    """获取或创建 Agent 实例（按参数缓存，避免重复创建）。"""
    key = (user_id, enable_knowledge, enable_search, system_prompt)
    if key not in _agent_cache:
        tools = make_tools(user_id, enable_knowledge, enable_search)
        tool_names = [t.name for t in tools]
        print(f"[AGENT] 创建新 Agent: key={key}, tools={tool_names}")
        prompt = system_prompt or AGENT_SYSTEM_PROMPT
        _agent_cache[key] = create_agent(
            llm,
            tools=tools,
            system_prompt=prompt,
            checkpointer=get_saver(),
        )
    else:
        print(f"[AGENT] 命中缓存 Agent: key={key}")
    return _agent_cache[key]


# ========== 主函数：流式 SSE 输出 ==========


async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    enable_knowledge: bool = True,
    enable_search: bool = False,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 和 enable_search 动态挂载工具。
    """
    print(f"[AGENT] stream_agent 参数: enable_knowledge={enable_knowledge}, enable_search={enable_search}, user_id={user_id}")
    # 1. 获取缓存的 Agent 实例
    agent = _get_agent(user_id, enable_knowledge, enable_search, memory_context)

    # 2. 构造消息（历史 + 当前输入）
    past_messages = get_thread_messages(thread_id)
    if image_url:
        content = [
            {"type": "text", "text": message},
            {"type": "image", "url": image_url},
        ]
    else:
        content = message
    messages = past_messages + [HumanMessage(content=content)]

    # 3. 遍历 Agent 输出，只返回 content（不展示工具过程）
    config = {"configurable": {"thread_id": thread_id}}

    for msg, metadata in agent.stream(
        {"messages": messages}, config, stream_mode="messages"
    ):
        node_name = metadata.get("langgraph_node", "")

        if node_name == "model":
            # 跳过工具调用消息（只向用户暴露最终回答，不暴露工具调用过程）
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                continue

            token = getattr(msg, "content", "")
            if token:
                yield _sse_json({"content": sanitize_response(str(token))})
                await asyncio.sleep(0.01)

    # 4. 完成
    yield _sse_json({"done": True})

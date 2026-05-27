"""Agent 深度思考的 LangGraph ReAct Agent。

自己构建 ReAct 图，模型节点直接 yield LLM.astream() 的逐 token chunk，
通过 graph.astream_events() 捕获真实流式输出，替代 create_agent 的 ainvoke 封装。
"""

import asyncio
import json
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict
from typing import Annotated

from services.storage.checkpoint_store import get_saver, get_async_saver, get_thread_messages
from services.tools.knowledge_tools import make_search_knowledge_tool
from .llm import llm

AGENT_SYSTEM_PROMPT = """# 角色设定

你叫**芳芳**，是一个聪明、可靠的智能助手，擅长通过调用工具来帮用户解决各种问题。

---

## 核心能力

- **知识库检索**：调用 `search_knowledge` 工具查询用户上传的文档
- **数学计算**：调用 `calculator` 工具进行精确计算

---

## 工作流程（ReAct）

每次回答前，请先判断当前问题是否需要调用工具：

```
1. 分析 → 用户问的是什么？是否需要查文档/计算/识图？
2. 调用 → 选择合适的工具，传入正确参数
3. 观察 → 查看工具返回的结果
4. 推理 → 基于结果组织回答
5. 输出 → 给出完整、准确的最终答案
```

> 如果不需要工具（闲聊、通用知识），直接回答即可，不要强行调用工具。

---

## 工具说明

### search_knowledge — 知识库搜索

**使用时机**：用户询问文档内容、需要查询特定知识、验证某个事实、总结文档要点时。

**参数**：
- `query`：搜索关键词，建议提取用户问题的核心意图

**返回值**：相关文档片段 + 来源文件名

**引用规范**：使用知识库内容时，必须在回答中标注来源，格式为 `【来源：文件名】`。

---

### calculator — 计算器

**使用时机**：用户要求进行数学运算、统计分析、单位换算等精确计算时。

**参数**：
- `expression`：数学表达式字符串

**支持的运算符**：`+` `-` `*` `/` `**` `%` `//` `( )` 以及 `abs`、`max`、`min`、`pow`、`round`、`sum`

---

## 提问案例与处理方式

### 案例 1：通用闲聊（无需工具）

**用户**：你好，今天天气怎么样？

**思考**：这是闲聊，我不需要调用任何工具，直接回答即可。

**回答**：你好呀！我是芳芳，很高兴见到你。不过我没有实时天气查询工具，你可以看看窗外或者打开天气 App 哦～

---

### 案例 2：查询知识库文档（需要 search_knowledge）

**用户**：请帮我查一下 2024 年 Q3 的销售额是多少？

**思考**：用户提到了"2024 年 Q3 销售额"，这很可能是文档中的具体数据，我应该调用 `search_knowledge` 工具来查找。

**工具调用**：
```json
{
  "name": "search_knowledge",
  "arguments": {
    "query": "2024年Q3销售额"
  }
}
```

**观察结果**：工具返回了文档《2024年度财务报表.pdf》中的相关内容："Q3 季度销售额达到 1,200 万元，环比增长 15%"

**回答**：根据文档《2024年度财务报表》中的数据，2024 年 Q3 的销售额为 **1,200 万元**，环比增长 15%。【来源：2024年度财务报表.pdf】

---

### 案例 3：需要计算（需要 calculator）

**用户**：如果每个人分 3 个苹果，42 个人需要多少个苹果？

**思考**：这是一个简单的数学计算，我应该调用 `calculator` 工具确保结果准确。

**工具调用**：
```json
{
  "name": "calculator",
  "arguments": {
    "expression": "3 * 42"
  }
}
```

**观察结果**：126

**回答**：42 个人，每人 3 个苹果，一共需要 **126 个苹果**。

---

### 案例 4：结合知识库和计算（多工具调用）

**用户**：Q3 销售额 1200 万，Q4 销售额 1500 万，Q4 比 Q3 增长了多少百分比？

**思考**：用户已经给出了数据，不需要搜索知识库，但需要做百分比计算，调用 `calculator`。

**工具调用**：
```json
{
  "name": "calculator",
  "arguments": {
    "expression": "(1500 - 1200) / 1200 * 100"
  }
}
```

**观察结果**：25.0

**回答**：Q4 比 Q3 增长了 **25%**。

---

### 案例 5：知识库中没有相关信息

**用户**：请查一下公司明年的上市计划。

**思考**：调用 `search_knowledge` 搜索。

**工具调用**：
```json
{
  "name": "search_knowledge",
  "arguments": {
    "query": "明年上市计划"
  }
}
```

**观察结果**：工具返回空结果，没有找到相关内容。

**回答**：我在知识库中没有找到关于公司明年上市计划的相关信息。可能是文档中尚未收录这部分内容，建议你查阅其他资料或联系相关部门确认。

---

## 注意事项

1. **不要编造**：知识库中没有的信息，明确告知用户"未找到相关资料"，不要猜测或编造。
2. **标注来源**：凡是引用了 `search_knowledge` 返回的内容，必须在回答中标注 `【来源：文件名】`。
3. **简洁高效**：能直接回答的问题不要绕弯子，需要工具时果断调用。
4. **中文回答**：所有思考和回答都用中文。

请用中文思考和回答。"""


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _make_process_with_steps(steps: list[dict]) -> dict:
    """从步骤列表构造兼容 studio.kxsz.net 的 process 数据结构。"""
    return {
        "plan": {
            "status": "successful",
            "message": ""
        },
        "step": {
            "status": "successful",
            "processes": steps,
            "source": [],
        },
        "task_status": "successful",
    }


def make_tools(user_id: str = "",
               doc_ids: str = "",
               enable_knowledge: bool = True):
    """创建已绑定 user_id 和 doc_ids 的工具列表。

    Args:
        enable_knowledge: 是否启用知识库搜索工具（由前端是否勾选知识库决定）
    """
    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id,
                                                      doc_ids=doc_ids)
        tools.append(search_knowledge)

    @tool
    def calculator(expression: str) -> str:
        """计算数学表达式，返回计算结果。

        当你需要进行数学计算时，请使用此工具。
        支持的运算符：+ - * / ** % // ( ) 以及常见数学函数。
        示例输入："2 + 3 * 4"、"(100 - 25) / 5"、"2 ** 10"
        """
        safe_names = {
            "abs": abs,
            "max": max,
            "min": min,
            "pow": pow,
            "round": round,
            "sum": sum,
        }
        try:
            result = eval(expression, {"__builtins__": {}}, safe_names)
            return str(result)
        except Exception as e:
            return f"计算错误：{str(e)}，请检查表达式格式。"

    tools.append(calculator)
    return tools


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def build_agent_graph(
    system_prompt: str = "",
    user_id: str = "",
    doc_ids: str = "",
    enable_knowledge: bool = True,
    checkpointer=None,
):
    """构建并编译 ReAct Agent 图。

    模型节点直接 yield llm.astream() 的 chunk，实现真正的逐 token 流式。
    """
    tools = make_tools(user_id=user_id,
                       doc_ids=doc_ids,
                       enable_knowledge=enable_knowledge)
    prompt = system_prompt or AGENT_SYSTEM_PROMPT

    tool_node = ToolNode(tools)
    model = llm.bind_tools(tools)

    async def agent_node(state: AgentState):
        messages = list(state.get("messages", []))
        if prompt:
            if not messages or getattr(messages[0], "type", "") != "system":
                messages.insert(0, SystemMessage(content=prompt))
            else:
                messages[0] = SystemMessage(content=prompt)
        async for chunk in model.astream(messages):
            yield {"messages": [chunk]}

    def should_continue(state: AgentState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tool_node)
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    workflow.add_edge("tools", "agent")
    return workflow.compile(checkpointer=checkpointer or get_saver())


async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    doc_ids: str = "",
    enable_knowledge: bool = True,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 决定是否挂载知识库工具。
    通过 graph.astream_events() 捕获 agent 节点内部 yield 的逐 token chunk。
    """
    saver = await get_async_saver()
    graph = build_agent_graph(memory_context,
                              user_id,
                              doc_ids,
                              enable_knowledge,
                              checkpointer=saver)
    config = {"configurable": {"thread_id": thread_id}}

    past_messages = get_thread_messages(thread_id)

    if image_url:
        content = f"用户上传了一张图片，图片地址为: {image_url}\n\n用户的问题是: {message}"
    else:
        content = message

    messages = past_messages + [HumanMessage(content=content)]

    yield _sse_json({
        "status": "processing",
        "process": _make_process_with_steps([{
            "step_id": "analysis",
            "status": "processing",
            "message": "",
            "description": "正在分析问题，准备调用工具...",
        }]),
    })
    await asyncio.sleep(0.08)

    steps: list[dict] = []
    yielded_tool_keys: set[str] = set()
    last_agent_chunk: str = ""

    async for event in graph.astream_events({"messages": messages}, config, version="v2"):
        kind = event["event"]
        metadata = event.get("metadata", {})
        node = metadata.get("langgraph_node", "")

        if kind != "on_chain_stream":
            continue
        if node not in ("agent", "tools"):
            continue

        chunk = event["data"].get("chunk", {})
        msg_list = chunk.get("messages", [])

        for msg in msg_list:
            if node == "agent":
                # 检测工具调用
                tool_call_chunks = getattr(msg, "tool_call_chunks", None)
                tool_calls = getattr(msg, "tool_calls", None)
                tc_list = []
                if tool_calls:
                    tc_list = list(tool_calls)
                elif tool_call_chunks:
                    tc_list = [tc for tc in tool_call_chunks if tc.get("name")]

                for tc in tc_list:
                    tool_name = tc.get("name", "unknown")
                    key = f"{tool_name}_{len(steps)}"
                    if key not in yielded_tool_keys:
                        yielded_tool_keys.add(key)
                        steps.append({
                            "step_id": tool_name,
                            "status": "processing",
                            "message": "",
                            "description": f"正在调用工具：{tool_name}...",
                        })
                        yield _sse_json({
                            "status": "processing",
                            "process": _make_process_with_steps(steps),
                        })
                        await asyncio.sleep(0.05)

                # 逐 token 输出（去重：LangGraph 会在节点结束时再发一次最终合并结果）
                token = getattr(msg, "content", "") or ""
                if token and token != last_agent_chunk:
                    last_agent_chunk = token
                    yield _sse_json({
                        "status": "stream_answer_content",
                        "content": token,
                        "process": _make_process_with_steps(steps),
                    })
                    await asyncio.sleep(0.01)

            elif node == "tools" and isinstance(msg, ToolMessage):
                # 更新最后一个 processing 状态的工具步骤
                for i in range(len(steps) - 1, -1, -1):
                    if steps[i]["status"] == "processing":
                        steps[i]["status"] = "successful"
                        steps[i]["description"] = f"工具返回：{str(msg.content)[:300]}"
                        yield _sse_json({
                            "status": "processing",
                            "process": _make_process_with_steps(steps),
                        })
                        await asyncio.sleep(0.05)
                        break
                last_agent_chunk = ""

    yield _sse_json({
        "status": "successful",
        "done": True,
    })

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
from .llm import llm

# ========== 系统提示词 ==========
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
2. **标注来源**：凡是引用了知识库返回的内容，必须在回答中标注 `【来源：文件名】`。
3. **简洁高效**：能直接回答的问题不要绕弯子，需要工具时果断调用。
4. **中文回答**：所有思考和回答都用中文。
5. **禁止暴露工具信息**：回答中**绝对不要**提及任何工具名称（如 search_knowledge、list_knowledge、calculator 等）或工具调用过程。用户应该感觉你在直接回答问题，而不是在调用工具。

请用中文思考和回答。"""


# ========== SSE 辅助函数 ==========


def _sse_json(data: dict) -> str:
    """把 dict 转成 SSE data: 行。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 工具创建 ==========


def make_tools(user_id: str = "", enable_knowledge: bool = True):
    """创建已绑定 user_id 的工具列表。"""
    from langchain_core.tools import tool

    tools = []

    if enable_knowledge:
        search_knowledge = make_search_knowledge_tool(user_id=user_id)
        tools.append(search_knowledge)
        list_knowledge = make_list_knowledge_tool(user_id=user_id)
        tools.append(list_knowledge)

    @tool
    def calculator(expression: str) -> str:
        """计算数学表达式，返回计算结果。"""
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


# ========== Agent 单例缓存 ==========

_agent_cache: dict = {}


def _get_agent(user_id: str, enable_knowledge: bool, system_prompt: str):
    """获取或创建 Agent 实例（按参数缓存，避免重复创建）。"""
    key = (user_id, enable_knowledge, system_prompt)
    if key not in _agent_cache:
        tools = make_tools(user_id, enable_knowledge)
        prompt = system_prompt or AGENT_SYSTEM_PROMPT
        _agent_cache[key] = create_agent(
            llm,
            tools=tools,
            system_prompt=prompt,
            checkpointer=get_saver(),
        )
    return _agent_cache[key]


# ========== 主函数：流式 SSE 输出 ==========


async def stream_agent(
    message: str,
    thread_id: str,
    user_id: str = "",
    memory_context: str = "",
    image_url: str = "",
    enable_knowledge: bool = True,
) -> AsyncIterator[str]:
    """Agent 流式 SSE 输出。

    所有对话统一走 Agent 模式，根据 enable_knowledge 决定是否挂载知识库工具。
    """
    # 1. 获取缓存的 Agent 实例
    agent = _get_agent(user_id, enable_knowledge, memory_context)

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
                yield _sse_json({"content": str(token)})
                await asyncio.sleep(0.01)

    # 4. 完成
    yield _sse_json({"done": True})

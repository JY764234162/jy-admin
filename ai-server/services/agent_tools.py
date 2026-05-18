"""Agent 可调用的工具集。

每个工具使用 @tool 装饰器注册，LangChain 会自动从函数签名和 docstring
生成 JSON Schema，供 LLM 在 function calling 时选用。
"""

from langchain_core.tools import tool

from services import vector_store


@tool
def search_knowledge(query: str, user_id: str = "") -> str:
    """搜索知识库，返回与查询最相关的文档片段。

    当你需要查询已上传的文档、获取特定知识、或验证某个事实时，请使用此工具。
    输入应为清晰、具体的问题或关键词。
    """
    results = vector_store.search(query, top_k=3, user_id=user_id)
    if not results:
        return "知识库中没有找到相关信息。"

    parts = []
    for i, r in enumerate(results, 1):
        source = r.get("source", "未知文件")
        parts.append(f"【来源：{source}】\n{r['content']}")

    return "\n\n---\n\n".join(parts)


@tool
def calculator(expression: str) -> str:
    """计算数学表达式，返回计算结果。

    当你需要进行数学计算时，请使用此工具。
    支持的运算符：+ - * / ** % // ( ) 以及常见数学函数。
    示例输入："2 + 3 * 4"、"(100 - 25) / 5"、"2 ** 10"
    """
    safe_names = {
        "abs": abs, "max": max, "min": min, "pow": pow,
        "round": round, "sum": sum,
    }
    try:
        result = eval(expression, {"__builtins__": {}}, safe_names)
        return str(result)
    except Exception as e:
        return f"计算错误：{str(e)}，请检查表达式格式。"


def get_tools(user_id: str = ""):
    """获取指定用户的工具列表。

    为了把 user_id 注入到 search_knowledge 中，我们用闭包生成一个
    已绑定 user_id 的工具实例。LangChain 的 @tool 会保留原函数的元信息，
    所以闭包方式可以正常工作。
    """
    from functools import partial

    bound_search = partial(search_knowledge.func, user_id=user_id)
    bound_search.__name__ = "search_knowledge"
    bound_search.__doc__ = search_knowledge.description

    return [
        search_knowledge,
        calculator,
    ]

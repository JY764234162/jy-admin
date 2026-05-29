"""联网搜索工具：供 Agent 检索互联网信息。"""

from langchain_core.tools import tool
from langchain_tavily import TavilySearch

import config


def _format_results(results: dict) -> str:
    """将 Tavily 搜索结果格式化为带来源的文本。"""
    if not results or not isinstance(results, dict):
        return "搜索未返回有效结果。"

    error = results.get("error")
    if error:
        return f"搜索出错：{error}"

    items = results.get("results", [])
    if not items:
        return "未找到相关搜索结果。"

    parts = []
    for i, r in enumerate(items, 1):
        title = r.get("title", "未知标题")
        url = r.get("url", "")
        content = r.get("content", "")
        parts.append(f"【结果 {i}】{title}\n{content}\n来源：{url}")

    return "\n\n---\n\n".join(parts)


def make_tavily_search_tool():
    """创建联网搜索工具。"""
    tavily = TavilySearch(
        tavily_api_key=config.TAVILY_API_KEY,
        max_results=3,
        search_depth="basic",
    )

    @tool
    def tavilysearch(query: str) -> str:
        """在互联网上搜索最新信息，返回相关网页摘要和来源链接。

        当用户问题涉及时事新闻、最新数据、实时信息、或通用知识库中未涵盖的内容时使用此工具。
        搜索结果会附带网页来源，便于在回答中引用。

        使用场景：
        - 用户询问"最近有什么新闻"
        - 用户要求"查一下今天的天气/股价"
        - 用户的问题明显需要参考互联网上的最新资料

        Args:
            query: 清晰、具体的搜索关键词
        """
        try:
            raw = tavily.invoke({"query": query})
            return _format_results(raw)
        except Exception as e:
            return f"搜索失败：{str(e)}"

    return tavilysearch

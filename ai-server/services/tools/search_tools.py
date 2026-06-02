"""联网搜索工具：供 Agent 检索互联网信息。"""

import json

from langchain_core.tools import tool
from langchain_tavily import TavilySearch

import config


def _format_results(results: dict) -> str:
    """将 Tavily 搜索结果格式化为结构化 JSON 文本。

    返回格式：
    {
        "results": [
            {
                "answer": "网页摘要内容",
                "citations": [{"title": "网页标题", "url": "链接地址"}],
                "images": ["图片URL1", "图片URL2"]
            }
        ]
    }
    """
    if not results or not isinstance(results, dict):
        return json.dumps({"results": []}, ensure_ascii=False)

    error = results.get("error")
    if error:
        return json.dumps({"error": error}, ensure_ascii=False)

    items = results.get("results", [])
    if not items:
        return json.dumps({"results": []}, ensure_ascii=False)

    formatted = []
    for r in items:
        formatted.append(
            {
                "answer": r.get("content", ""),
                "citations": [
                    {
                        "title": r.get("title", "未知标题"),
                        "url": r.get("url", ""),
                    }
                ],
                "images": r.get("images", []) or [],
            }
        )

    return json.dumps({"results": formatted}, ensure_ascii=False, indent=2)


def make_tavily_search_tool():
    """创建联网搜索工具。"""
    tavily = TavilySearch(
        tavily_api_key=config.TAVILY_API_KEY,
        max_results=5,
        topic="general",
    )

    @tool
    def tavilysearch(query: str) -> str:
        """在互联网上搜索最新信息，返回相关网页摘要、来源链接和相关图片。

        当用户问题涉及时事新闻、最新数据、实时信息、或通用知识库中未涵盖的内容时，**必须使用此工具**。
        搜索结果会附带网页来源和相关图片链接，便于在回答中引用和展示。

        使用场景（遇到以下情况**必须调用**）：
        - 用户询问"最近有什么新闻"、"最新动态"
        - 用户要求"查一下今天的天气/股价/赛事结果"
        - 用户的问题涉及时效性信息（如"2025年"、"最近"、"最新"）
        - 用户的问题明显需要参考互联网上的最新资料

        返回值说明：
        - 每个结果包含：标题、摘要、来源链接
        - 如果结果中有相关图片，会附带图片链接（URL）

        Args:
            query: 清晰、具体的搜索关键词（建议用中文）
        """
        print(f"[TAVILY] 调用搜索: query={query}")
        try:
            raw = tavily.invoke({"query": query})
            formatted = _format_results(raw)
            print(f"[TAVILY] 搜索完成，结果长度: {len(formatted)}")
            return formatted
        except Exception as e:
            print(f"[TAVILY] 搜索失败: {e}")
            return f"搜索失败：{str(e)}"

    return tavilysearch

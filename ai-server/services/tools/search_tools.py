"""联网搜索工具：供 Agent 检索互联网信息。"""

import json
from typing import Any

from langchain_core.tools import tool
from langchain_tavily import TavilySearch

import config


def _normalize_images(images: list) -> list[dict[str, str]]:
    """将 Tavily 图片（字符串或 {url, description}）统一为带描述的结构。"""
    normalized: list[dict[str, str]] = []
    for item in images or []:
        url = ""
        description = ""
        if isinstance(item, str) and item.strip():
            url = item.strip()
        elif isinstance(item, dict):
            url = (item.get("url") or "").strip()
            description = (item.get("description") or "").strip()
        if url:
            normalized.append(
                {
                    "url": url,
                    "description": description or "（暂无图片描述，请结合上下文说明）",
                }
            )
    return normalized


def _numbered_images(images: list, *, start_index: int = 1) -> list[dict[str, Any]]:
    """为图片列表添加序号。"""
    normalized = _normalize_images(images)
    return [
        {"index": start_index + i, "url": img["url"], "description": img["description"]}
        for i, img in enumerate(normalized)
    ]


def _format_results(results: dict) -> str:
    """将 Tavily 搜索结果格式化为带序号、摘要与图片描述的 JSON。"""
    if not results or not isinstance(results, dict):
        return json.dumps({"results": [], "related_images": []}, ensure_ascii=False)

    error = results.get("error")
    if error:
        return json.dumps({"error": error}, ensure_ascii=False)

    items = results.get("results", [])
    if not items:
        payload: dict[str, Any] = {
            "query": results.get("query", ""),
            "results": [],
            "related_images": _numbered_images(results.get("images", [])),
        }
        if results.get("answer"):
            payload["answer"] = results.get("answer")
        return json.dumps(payload, ensure_ascii=False, indent=2)

    formatted_results: list[dict[str, Any]] = []
    global_image_index = 1

    for idx, r in enumerate(items, start=1):
        result_images = _normalize_images(r.get("images", []))
        numbered_result_images = [
            {
                "index": global_image_index + i,
                "url": img["url"],
                "description": img["description"],
            }
            for i, img in enumerate(result_images)
        ]
        global_image_index += len(numbered_result_images)

        formatted_results.append(
            {
                "index": idx,
                "title": r.get("title", "未知标题"),
                "summary": (r.get("content") or "").strip(),
                "source_url": r.get("url", ""),
                "relevance_score": r.get("score"),
                "images": numbered_result_images,
            }
        )

    seen_urls = {
        img["url"]
        for row in formatted_results
        for img in row.get("images", [])
    }
    related_images: list[dict[str, Any]] = []
    next_idx = global_image_index
    for img in _normalize_images(results.get("images", [])):
        if img["url"] in seen_urls:
            continue
        related_images.append(
            {"index": next_idx, "url": img["url"], "description": img["description"]}
        )
        next_idx += 1

    payload = {
        "query": results.get("query", ""),
        "results": formatted_results,
        "related_images": related_images,
    }
    if results.get("answer"):
        payload["answer"] = results.get("answer")

    payload["usage_hint"] = (
        "向用户展示时请保留每条结果的 index 序号；引用图片时使用 images/index 与 description，"
        "并在 Markdown 中用 ![描述](url) 或附序号说明。"
    )
    return json.dumps(payload, ensure_ascii=False, indent=2)


def make_tavily_search_tool():
    """创建联网搜索工具。"""
    tavily = TavilySearch(
        tavily_api_key=config.TAVILY_API_KEY,
        max_results=5,
        topic="general",
        include_images=True,
        include_image_descriptions=True,
    )

    @tool
    def tavilysearch(query: str) -> str:
        """在互联网上搜索最新信息，返回带序号的网页摘要、来源链接及带描述的图片列表。

        当用户问题涉及时事新闻、最新数据、实时信息、或通用知识库中未涵盖的内容时，**必须使用此工具**。
        当用户需要图片（如「找几张××的图片」）时，**必须**调用本工具，并在回答中按返回的 index 逐条说明每张图的 description。

        使用场景（遇到以下情况**必须调用**）：
        - 用户询问"最近有什么新闻"、"最新动态"
        - 用户要求"查一下今天的天气/股价/赛事结果"
        - 用户的问题涉及时效性信息（如"2025年"、"最近"、"最新"）
        - 用户要求搜索、展示或描述某类图片

        返回值说明：
        - results[]：每条含 index、title、summary、source_url，及该条下的 images[]（含 index、url、description）
        - related_images[]：与查询相关的全局配图（含 index、url、description）

        Args:
            query: 清晰、具体的搜索关键词（建议用中文）
        """
        print(f"[TAVILY] 调用搜索: query={query}")
        try:
            raw = tavily.invoke(
                {
                    "query": query,
                    "include_images": True,
                    "include_image_descriptions": True,
                }
            )
            formatted = _format_results(raw)
            print(f"[TAVILY] 搜索完成，结果长度: {len(formatted)}")
            return formatted
        except Exception as e:
            print(f"[TAVILY] 搜索失败: {e}")
            return f"搜索失败：{str(e)}"

    return tavilysearch

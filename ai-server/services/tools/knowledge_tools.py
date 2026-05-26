"""知识库搜索工具：供 Agent 检索已上传文档中的相关内容。"""

from typing import List

from langchain_core.tools import tool

from services.storage import vector_store


def _format_results(results: List[dict]) -> str:
    """将检索结果格式化为带来源的文本。"""
    if not results:
        return "知识库中没有找到相关信息。"

    parts = []
    for i, r in enumerate(results, 1):
        source = r.get("source", "未知文件")
        parts.append(f"【来源：{source}】\n{r['content']}")

    return "\n\n---\n\n".join(parts)


def _do_search(query: str, doc_ids: str = "", user_id: str = "") -> str:
    """执行知识库搜索的实际逻辑。"""
    if doc_ids:
        doc_id_list = [d.strip() for d in doc_ids.split(",") if d.strip()]
        if doc_id_list:
            seen = set()
            all_results = []
            for doc_id in doc_id_list:
                results = vector_store.search_by_doc_id(query, doc_id, top_k=3, user_id=user_id)
                for r in results:
                    key = (r.get("doc_id", ""), r.get("content", ""))
                    if key not in seen:
                        seen.add(key)
                        all_results.append(r)
            all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
            return _format_results(all_results[:6])

    results = vector_store.search(query, top_k=5, user_id=user_id)
    return _format_results(results)


def make_search_knowledge_tool(user_id: str = "", doc_ids: str = ""):
    """创建已绑定 user_id 和 doc_ids 的知识库搜索工具。"""

    @tool
    def search_knowledge(query: str) -> str:
        """搜索知识库，返回与查询最相关的文档片段及其来源。

        当用户问题涉及已上传的文档、需要查询特定知识、或验证某个事实时使用此工具。
        搜索结果会附带来源文件名，便于在回答中引用。

        使用场景：
        - 用户询问"文档 XXX 中说了什么"
        - 用户要求"根据上传的文件回答"
        - 用户的问题明显需要参考知识库中的资料

        Args:
            query: 清晰、具体的问题或关键词
        """
        return _do_search(query, doc_ids=doc_ids, user_id=user_id)

    return search_knowledge

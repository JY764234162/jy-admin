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


def _do_search(query: str, user_id: str = "") -> str:
    """执行知识库搜索的实际逻辑。"""
    results = vector_store.search(query, top_k=5, user_id=user_id)
    return _format_results(results)


def _format_document_list(docs: List[dict]) -> str:
    """将文档列表格式化为带可点击链接的 Markdown 文本。"""
    if not docs:
        return "知识库中暂无文档。"

    lines = ["已上传的知识库文档列表：\n"]
    for i, doc in enumerate(docs, 1):
        source = doc.get("source", "未知文件")
        doc_id = doc.get("doc_id", "")
        file_type = doc.get("file_type", "")
        chunk_count = doc.get("chunk_count", 0)
        cos_url = doc.get("cos_url", "")
        created_at = doc.get("created_at", "")[:10]  # 只取日期部分

        # 优先使用 COS 链接，无链接则显示纯文本
        name_link = f"[{source}]({cos_url})" if cos_url else source
        lines.append(f"{i}. {name_link} ｜ 类型：{file_type} ｜ 切片数：{chunk_count} ｜ 上传时间：{created_at} ｜ ID：`{doc_id}`")

    lines.append("\n> 点击文件名可查看原始文档。如需针对某份文档提问，可引用其 ID。")
    return "\n".join(lines)


def make_search_knowledge_tool(user_id: str = ""):
    """创建已绑定 user_id 的知识库搜索工具。"""

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
        return _do_search(query, user_id=user_id)

    return search_knowledge


def make_list_knowledge_tool(user_id: str = ""):
    """创建获取知识库文档列表的工具。"""

    @tool
    def list_knowledge() -> str:
        """获取当前知识库中所有已上传文档的列表，包含可点击的文件链接。

        当用户询问"有哪些文档"、"上传了什么文件"、"知识库里有什么"时使用此工具。
        返回结果中包含文件名（可点击打开原始文件）、文件类型、切片数量和上传时间。

        使用场景：
        - 用户问"知识库有哪些文档"
        - 用户问"上传了什么文件"
        - 用户想查看已上传文档的清单
        """
        docs = vector_store.list_documents(user_id=user_id)
        return _format_document_list(docs)

    return list_knowledge

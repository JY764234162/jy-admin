from pathlib import Path
from typing import List, Dict

from langchain_community.vectorstores import PGVector
from langchain_core.documents import Document
from sqlalchemy import create_engine, text

import config
from services.rag import embedding

_connection_string = config.PG_CONNECTION_STRING
_collection_name = "jy_admin_knowledge"


def get_store() -> PGVector:
    """获取 PGVector 实例（懒加载）"""
    return PGVector(
        connection_string=_connection_string,
        collection_name=_collection_name,
        embedding_function=embedding.get_embeddings(),
    )


def _get_engine():
    return create_engine(_connection_string)


def add_documents(documents: List[Document]) -> int:
    """向知识库添加文档（LangChain Document 列表）"""
    store = get_store()
    store.add_documents(documents)
    return len(documents)


def search(query: str, top_k: int = 3, user_id: str = "") -> List[Dict]:
    """语义检索，返回最相关的文档片段。若指定 user_id 且该用户有新数据则只查该用户，否则 fallback 全局（兼容旧数据）。"""
    store = get_store()
    kwargs = {"k": top_k}
    if user_id:
        kwargs["filter"] = {"user_id": user_id}
    docs_with_scores = store.similarity_search_with_score(query, **kwargs)
    # fallback：按 user_id 过滤没结果时，尝试全局检索（兼容无 user_id 的旧数据）
    if user_id and not docs_with_scores:
        docs_with_scores = store.similarity_search_with_score(query, k=top_k)
    return [
        {
            "content": doc.page_content,
            "score": float(score),
            "source": doc.metadata.get("source", ""),
            "doc_id": doc.metadata.get("doc_id", ""),
        }
        for doc, score in docs_with_scores
    ]


def search_by_doc_id(query: str, doc_id: str, top_k: int = 3, user_id: str = "") -> List[Dict]:
    """在指定文档的 chunks 中做向量检索（按 doc_id 过滤）"""
    store = get_store()
    filter_dict = {"doc_id": doc_id}
    if user_id:
        filter_dict["user_id"] = user_id
    docs_with_scores = store.similarity_search_with_score(query, k=top_k, filter=filter_dict)
    # fallback：兼容旧数据
    if user_id and not docs_with_scores:
        docs_with_scores = store.similarity_search_with_score(query, k=top_k, filter={"doc_id": doc_id})
    return [
        {
            "content": doc.page_content,
            "score": float(score),
            "source": doc.metadata.get("source", ""),
            "doc_id": doc.metadata.get("doc_id", ""),
        }
        for doc, score in docs_with_scores
    ]


def list_documents(user_id: str = "") -> List[Dict]:
    """列出已上传的文档（按 doc_id 去重，可按 user_id 过滤）"""
    engine = _get_engine()
    with engine.connect() as conn:
        user_filter = ""
        params = {"name": _collection_name}
        if user_id:
            user_filter = "AND (cmetadata->>'user_id' = :user_id OR cmetadata->>'user_id' IS NULL)"
            params["user_id"] = user_id

        result = conn.execute(
            text(f"""
                SELECT DISTINCT
                    cmetadata->>'doc_id' as doc_id,
                    cmetadata->>'source' as source,
                    cmetadata->>'file_type' as file_type,
                    cmetadata->>'created_at' as created_at,
                    cmetadata->>'parse_at' as parse_at,
                    cmetadata->>'cos_url' as cos_url,
                    COUNT(*) OVER (PARTITION BY cmetadata->>'doc_id') as chunk_count
                FROM langchain_pg_embedding
                WHERE collection_id = (
                    SELECT uuid FROM langchain_pg_collection WHERE name = :name
                )
                {user_filter}
            """),
            params,
        )
        rows = result.fetchall()
        seen = set()
        docs = []
        for row in rows:
            if row.doc_id and row.doc_id not in seen:
                seen.add(row.doc_id)
                source = row.source or ""
                docs.append({
                    "doc_id": row.doc_id,
                    "source": source,
                    "chunk_count": int(row.chunk_count) if row.chunk_count else 0,
                    "file_type": row.file_type or (Path(source).suffix if source else ""),
                    "created_at": row.created_at or "",
                    "parse_at": row.parse_at or "",
                    "cos_url": row.cos_url or "",
                    "status": "indexed",
                })
        return docs


def clear_old_documents() -> bool:
    """清空没有 parse_at 字段的旧版向量数据，返回是否执行了清空"""
    engine = _get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT COUNT(*) as cnt
                FROM langchain_pg_embedding
                WHERE collection_id = (
                    SELECT uuid FROM langchain_pg_collection WHERE name = :name
                )
                AND cmetadata->>'parse_at' IS NULL
            """),
            {"name": _collection_name},
        )
        row = result.fetchone()
        if row and row.cnt > 0:
            conn.execute(
                text("""
                    DELETE FROM langchain_pg_embedding
                    WHERE collection_id = (
                        SELECT uuid FROM langchain_pg_collection WHERE name = :name
                    )
                """),
                {"name": _collection_name},
            )
            conn.commit()
            return True
        return False


def delete_document(doc_id: str, user_id: str = "") -> bool:
    """删除指定文档的所有片段"""
    engine = _get_engine()
    with engine.connect() as conn:
        user_filter = ""
        params = {"name": _collection_name, "doc_id": doc_id}
        if user_id:
            user_filter = "AND (cmetadata->>'user_id' = :user_id OR cmetadata->>'user_id' IS NULL)"
            params["user_id"] = user_id

        result = conn.execute(
            text(f"""
                DELETE FROM langchain_pg_embedding
                WHERE collection_id = (
                    SELECT uuid FROM langchain_pg_collection WHERE name = :name
                )
                AND cmetadata->>'doc_id' = :doc_id
                {user_filter}
            """),
            params,
        )
        conn.commit()
        return result.rowcount > 0

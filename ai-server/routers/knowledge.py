import asyncio
import json
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

import config
from services import document, vector_store
from services.llm import llm

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 3
    structured: bool = False
    user_id: str = ""


# RAG Prompt 模板（通用问答）
RAG_PROMPT = PromptTemplate.from_template(
    """你是一个文档问答助手。请严格根据以下参考资料回答用户的问题。
如果资料中没有找到相关信息，请明确说"文档中没有找到相关信息"。

参考资料：
{context}

用户问题：{question}

请给出准确、简洁的回答："""
)

# 文档总结 Prompt（用户明确指定了文件名）
SUMMARY_PROMPT = PromptTemplate.from_template(
    """你是一个文档分析助手。请根据以下文档内容，回答用户关于该文档的问题。
如果文档内容为空或无法回答，请明确说明。

文档内容：
{context}

用户问题：{question}

请基于文档内容给出回答："""
)


def _format_docs(docs: List[Document]) -> str:
    """将检索到的文档格式化为上下文字符串（带上来源文件名）"""
    parts = []
    for doc in docs:
        source = doc.metadata.get("source", "未知文件")
        parts.append(f"【来源：{source}】\n{doc.page_content}")
    return "\n\n---\n\n".join(parts)


def _extract_doc_id_from_query(query: str, all_docs: List[dict]) -> str | None:
    """从查询中提取可能引用的文件名对应的 doc_id。
    优先匹配完整文件名（含扩展名），其次匹配去掉扩展名的文件名。
    如果匹配到多个，返回最长的匹配（最精确）。"""
    query_lower = query.lower()
    candidates = []
    for doc in all_docs:
        source = doc.get("source", "")
        if not source:
            continue
        stem = Path(source).stem.lower()
        source_lower = source.lower()
        if source_lower in query_lower:
            candidates.append((len(source), doc.get("doc_id")))
        elif stem in query_lower:
            candidates.append((len(stem), doc.get("doc_id")))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(file.filename).suffix.lower()
    if ext not in document.PARSERS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {list(document.PARSERS.keys())}")

    file_bytes = await file.read()

    text = document.parse_file(file.filename, file_bytes)
    if not text.strip():
        raise HTTPException(400, "文件内容为空或无法提取文字")

    chunks = document.split_text(text)
    if not chunks:
        raise HTTPException(400, "文档拆分结果为空")

    doc_id = uuid.uuid4().hex[:12]
    documents = [
        Document(page_content=chunk, metadata={"doc_id": doc_id, "source": file.filename})
        for chunk in chunks
    ]
    vector_store.add_documents(documents)

    save_path = config.UPLOAD_DIR / f"{doc_id}_{file.filename}"
    save_path.write_bytes(file_bytes)

    return {"knowledge_id": doc_id, "filename": file.filename, "chunks": len(chunks)}


@router.post("/parse")
async def parse_document(
    file: UploadFile = File(...),
    doc_id: str = Form(None),
    user_id: str = Form(""),
):
    """纯解析接口：解析文件、分块、向量存储，不保存原始文件到磁盘

    - 若调用方传入 doc_id，则使用该 doc_id 写入向量库（与上游对齐）
    - user_id 用于按用户隔离向量数据
    """
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(file.filename).suffix.lower()
    if ext not in document.PARSERS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {list(document.PARSERS.keys())}")

    file_bytes = await file.read()

    text = document.parse_file(file.filename, file_bytes)
    if not text.strip():
        raise HTTPException(400, "文件内容为空或无法提取文字")

    chunks = document.split_text(text)
    if not chunks:
        raise HTTPException(400, "文档拆分结果为空")

    final_doc_id = doc_id if doc_id else uuid.uuid4().hex[:12]
    documents = [
        Document(
            page_content=chunk,
            metadata={"doc_id": final_doc_id, "source": file.filename, "user_id": user_id or ""},
        )
        for chunk in chunks
    ]
    vector_store.add_documents(documents)

    return {"doc_id": final_doc_id, "filename": file.filename, "chunks": len(chunks)}


def _sse_json(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/query")
async def query_knowledge(req: QueryRequest):
    if not req.question.strip():
        raise HTTPException(400, "问题不能为空")

    docs = vector_store.list_documents(user_id=req.user_id)
    if not docs:
        raise HTTPException(400, "知识库为空，请先上传文档")

    # 检测用户是否引用了某个特定文件名
    matched_doc_id = _extract_doc_id_from_query(req.question, docs)

    # 如果匹配到文件名，直接获取该文件 chunks（带 user_id 隔离 + fallback 兼容旧数据）
    manual_docs: List[Document] | None = None
    if matched_doc_id:
        doc_info = next((d for d in docs if d["doc_id"] == matched_doc_id), None)
        chunk_count = doc_info.get("chunk_count", 0) if doc_info else 0
        top_k = chunk_count if chunk_count <= 20 else req.top_k
        results = vector_store.search_by_doc_id(req.question, matched_doc_id, top_k, req.user_id)
        # fallback：兼容无 user_id 的旧数据
        if req.user_id and not results:
            results = vector_store.search_by_doc_id(req.question, matched_doc_id, top_k, "")
        manual_docs = [
            Document(page_content=r["content"], metadata={"source": r["source"], "doc_id": r["doc_id"]})
            for r in results
        ]

    # 构建上下文获取函数
    if manual_docs is not None:
        context_fn = lambda _: _format_docs(manual_docs)
    else:
        search_kwargs = {"k": req.top_k}
        if req.user_id:
            search_kwargs["filter"] = {"user_id": req.user_id}
        store = vector_store.get_store()
        retriever = store.as_retriever(search_kwargs=search_kwargs)
        context_fn = retriever | _format_docs

    # 根据是否匹配到文件名选择 Prompt
    active_prompt = SUMMARY_PROMPT if matched_doc_id else RAG_PROMPT

    if req.structured:
        # 结构化输出：Prompt 中要求返回 JSON，手动解析（兼容不支持 response_format 的模型）
        if matched_doc_id:
            structured_prompt = PromptTemplate.from_template(
                """你是一个文档分析助手。请根据以下文档内容回答用户的问题。
如果文档内容为空或无法回答，请明确说明。

文档内容：
{context}

用户问题：{question}

请用 JSON 格式返回结果，必须包含以下字段：
- answer: 根据文档内容生成的回答（字符串）
- sources: 引用的来源文件列表（字符串数组）
- confidence: 回答置信度，范围 0.0~1.0（数字）

只返回 JSON，不要有任何其他文字。"""
            )
        else:
            structured_prompt = PromptTemplate.from_template(
                """你是一个文档问答助手。请严格根据以下参考资料回答用户的问题。
如果资料中没有找到相关信息，请明确说"文档中没有找到相关信息"。

参考资料：
{context}

用户问题：{question}

请用 JSON 格式返回结果，必须包含以下字段：
- answer: 根据参考资料生成的回答（字符串）
- sources: 引用的来源文件列表（字符串数组）
- confidence: 回答置信度，范围 0.0~1.0（数字）

只返回 JSON，不要有任何其他文字。"""
            )
        rag_chain = (
            {
                "context": context_fn,
                "question": RunnablePassthrough(),
            }
            | structured_prompt
            | llm
            | StrOutputParser()
        )
        raw = rag_chain.invoke(req.question)
        import json as _json
        try:
            data = _json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
            return {"answer": data.get("answer", ""), "sources": data.get("sources", []), "confidence": data.get("confidence", 0.5)}
        except Exception:
            # 解析失败时回退到普通文本
            return {"answer": raw, "sources": [], "confidence": 0.5}
    else:
        # 流式输出：使用 LCEL 链 + StrOutputParser
        async def event_generator():
            rag_chain = (
                {
                    "context": context_fn,
                    "question": RunnablePassthrough(),
                }
                | active_prompt
                | llm
                | StrOutputParser()
            )

            # 优先使用异步流，回退到同步流
            try:
                if hasattr(rag_chain, "astream"):
                    async for chunk in rag_chain.astream(req.question):
                        yield _sse_json({"content": chunk, "done": False})
                        await asyncio.sleep(0.08)
                else:
                    for chunk in rag_chain.stream(req.question):
                        yield _sse_json({"content": chunk, "done": False})
                        await asyncio.sleep(0.08)
                yield _sse_json({"content": "", "done": True})
            except Exception as e:
                yield _sse_json({"content": "", "done": True, "error": str(e)})

        return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/list")
async def list_knowledge(user_id: str = Query("")):
    return {"documents": vector_store.list_documents(user_id=user_id)}


@router.delete("/{doc_id}")
async def delete_knowledge(doc_id: str, user_id: str = Query("")):
    ok = vector_store.delete_document(doc_id, user_id=user_id)
    if not ok:
        raise HTTPException(404, f"文档 {doc_id} 不存在")

    for f in config.UPLOAD_DIR.glob(f"{doc_id}_*"):
        f.unlink()

    return {"message": f"文档 {doc_id} 已删除"}

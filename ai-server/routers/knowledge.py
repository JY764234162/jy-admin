import uuid
from pathlib import Path
from typing import List, Dict

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from langchain_core.prompts import PromptTemplate

import config
from services import document, embedding, vector_store
from services.llm import llm

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 3
    structured: bool = False


# RAG Prompt 模板
RAG_PROMPT = PromptTemplate.from_template(
    """你是一个文档问答助手。请严格根据以下参考资料回答用户的问题。
如果资料中没有相关内容，请明确说"文档中没有找到相关信息"。

参考资料：
{context}

来源文件：{sources}

用户问题：{question}

请给出准确、简洁的回答："""
)


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

    # 用本地 TF-IDF 向量化
    embeddings = embedding.embed_documents(chunks)

    doc_id = uuid.uuid4().hex[:12]
    vector_store.add_documents(doc_id, file.filename, chunks, embeddings)

    save_path = config.UPLOAD_DIR / f"{doc_id}_{file.filename}"
    save_path.write_bytes(file_bytes)

    return {"knowledge_id": doc_id, "filename": file.filename, "chunks": len(chunks)}


@router.post("/query")
async def query_knowledge(req: QueryRequest):
    if not req.question.strip():
        raise HTTPException(400, "问题不能为空")

    docs = vector_store.list_documents()
    if not docs:
        raise HTTPException(400, "知识库为空，请先上传文档")

    if req.structured:
        # 结构化输出
        query_emb = embedding.embed_query(req.question)
        results = vector_store.search(query_emb, top_k=req.top_k)
        context_parts = [r["content"] for r in results]
        sources = list(set(r["source"] for r in results))

        context = "\n\n---\n\n".join(context_parts)
        sources_text = "、".join(sources)

        messages = [
            {"role": "system", "content": "你是一个文档问答助手。请严格根据参考资料回答，输出 JSON 格式。"},
            {"role": "user", "content": RAG_PROMPT.format(context=context, sources=sources_text, question=req.question) + "\n\n请以 JSON 格式输出：{\"answer\": \"...\", \"sources\": [...], \"confidence\": 0.0~1.0}"}
        ]
        response = llm.invoke(messages)
        content = response.content

        # 尝试解析 JSON
        import json
        try:
            start = content.index("{")
            end = content.rindex("}") + 1
            parsed = json.loads(content[start:end])
            return parsed
        except (ValueError, json.JSONDecodeError):
            return {"answer": content, "sources": sources, "confidence": 0.5}
    else:
        # 流式输出
        async def event_generator():
            query_emb = embedding.embed_query(req.question)
            results = vector_store.search(query_emb, top_k=req.top_k)
            context_parts = [r["content"] for r in results]
            sources = list(set(r["source"] for r in results))

            context = "\n\n---\n\n".join(context_parts)
            sources_text = "、".join(sources)

            prompt = RAG_PROMPT.format(context=context, sources=sources_text, question=req.question)

            for chunk in llm.stream(prompt):
                if chunk.content:
                    yield {"data": chunk.content}
            yield {"data": "[DONE]"}

        return EventSourceResponse(event_generator())


@router.get("/list")
async def list_knowledge():
    return {"documents": vector_store.list_documents()}


@router.delete("/{doc_id}")
async def delete_knowledge(doc_id: str):
    ok = vector_store.delete_document(doc_id)
    if not ok:
        raise HTTPException(404, f"文档 {doc_id} 不存在")

    for f in config.UPLOAD_DIR.glob(f"{doc_id}_*"):
        f.unlink()

    return {"message": f"文档 {doc_id} 已删除"}

import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import config
from services import embedding, vector_store, document
from services.llm import chat_stream

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 3


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

    embeddings = embedding.embed_texts(chunks)

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

    query_emb = embedding.embed_query(req.question)
    results = vector_store.search(query_emb, top_k=req.top_k)

    if not results:
        raise HTTPException(404, "未找到相关内容")

    context_parts = []
    sources = set()
    for r in results:
        context_parts.append(r["content"])
        sources.add(r["source"])

    context = "\n\n---\n\n".join(context_parts)
    sources_text = "、".join(sources)

    system_prompt = (
        "你是一个文档问答助手。请严格根据以下参考资料回答用户的问题。"
        "如果资料中没有相关内容，请明确说'文档中没有找到相关信息'。"
        "回答时请说明信息来自哪个文件。"
    )
    user_prompt = f"参考资料：\n{context}\n\n来源文件：{sources_text}\n\n用户问题：{req.question}"

    async def event_generator():
        stream = chat_stream([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ])
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield {"data": delta.content}
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

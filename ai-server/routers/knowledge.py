import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

import config
from services import document, vector_store
from services.llm import llm, get_structured_llm

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class QueryRequest(BaseModel):
    question: str
    top_k: int = 3
    structured: bool = False


# RAG Prompt 模板
RAG_PROMPT = PromptTemplate.from_template(
    """你是一个文档问答助手。请严格根据以下参考资料回答用户的问题。
如果资料中没有找到相关信息，请明确说"文档中没有找到相关信息"。

参考资料：
{context}

用户问题：{question}

请给出准确、简洁的回答："""
)


def _format_docs(docs: List[Document]) -> str:
    """将检索到的文档格式化为上下文字符串"""
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


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


@router.post("/query")
async def query_knowledge(req: QueryRequest):
    if not req.question.strip():
        raise HTTPException(400, "问题不能为空")

    docs = vector_store.list_documents()
    if not docs:
        raise HTTPException(400, "知识库为空，请先上传文档")

    # 构建 LangChain Retriever
    store = vector_store.get_store()
    retriever = store.as_retriever(search_kwargs={"k": req.top_k})

    if req.structured:
        # 结构化输出：使用 LangChain with_structured_output
        rag_chain = (
            {
                "context": retriever | _format_docs,
                "question": RunnablePassthrough(),
            }
            | RAG_PROMPT
            | get_structured_llm()
        )
        result = rag_chain.invoke(req.question)
        return result.dict() if hasattr(result, "dict") else dict(result)
    else:
        # 流式输出：使用 LCEL 链 + StrOutputParser
        async def event_generator():
            rag_chain = (
                {
                    "context": retriever | _format_docs,
                    "question": RunnablePassthrough(),
                }
                | RAG_PROMPT
                | llm
                | StrOutputParser()
            )

            # 优先使用异步流，回退到同步流
            if hasattr(rag_chain, "astream"):
                async for chunk in rag_chain.astream(req.question):
                    yield {"data": chunk}
            else:
                for chunk in rag_chain.stream(req.question):
                    yield {"data": chunk}
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

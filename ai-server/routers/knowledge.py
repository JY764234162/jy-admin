import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

import config
from services.rag import document, embedding
from services.storage import vector_store
from services.llm import llm

router = APIRouter(prefix="/api/ai/knowledge", tags=["knowledge"])


# ========== 异步文档解析任务管理 ==========

@dataclass
class ParseTask:
    task_id: str
    filename: str
    stage: str = "pending"           # pending / parsing / splitting / embedding / storing / completed / failed
    message: str = "等待处理..."
    progress: int = 0                # 0~100
    total_chunks: int = 0
    doc_id: str = ""
    error: str = ""
    done: bool = False
    created_at: float = field(default_factory=time.time)
    _queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    async def emit(self, stage: str, message: str, progress: int, **extra):
        self.stage = stage
        self.message = message
        self.progress = progress
        payload = {"stage": stage, "message": message, "progress": progress, **extra}
        await self._queue.put(payload)

    async def finish(self, doc_id: str = "", chunk_count: int = 0, error: str = ""):
        self.done = True
        self.doc_id = doc_id
        self.total_chunks = chunk_count
        if error:
            self.stage = "failed"
            self.message = error
            self.progress = 0
        else:
            self.stage = "completed"
            self.message = "文档已就绪"
            self.progress = 100
        payload = {
            "stage": self.stage,
            "message": self.message,
            "progress": self.progress,
            "doc_id": doc_id,
            "chunk_count": chunk_count,
        }
        if error:
            payload["error"] = error
        await self._queue.put(payload)


# 内存任务存储（生产环境建议用 Redis）
_parse_tasks: Dict[str, ParseTask] = {}


def _create_parse_task(filename: str) -> ParseTask:
    task_id = uuid.uuid4().hex[:16]
    task = ParseTask(task_id=task_id, filename=filename)
    _parse_tasks[task_id] = task
    return task


def _get_parse_task(task_id: str) -> ParseTask | None:
    return _parse_tasks.get(task_id)




async def _process_document_async(task: ParseTask, file_bytes: bytes, user_id: str = "", doc_id: str = ""):
    """后台协程：解析文档并实时推送进度"""
    try:
        # 1. 解析文件
        await task.emit("parsing", "正在解析文档...", 5)
        text = document.parse_file(task.filename, file_bytes)
        if not text.strip():
            await task.finish(error="文件内容为空或无法提取文字")
            return

        # 2. 切片
        await task.emit("splitting", "正在切片...", 20)
        chunks = document.split_text(text)
        if not chunks:
            await task.finish(error="文档拆分结果为空")
            return

        total = len(chunks)
        if not doc_id:
            doc_id = uuid.uuid4().hex[:12]

        # 3. 向量化（分批次，每批推送进度）
        await task.emit("embedding", f"正在向量化(0/{total})...", 30, total=total)

        embed_fn = embedding.get_embeddings()
        batch_size = 8
        all_embeddings: List[List[float]] = []

        for i in range(0, total, batch_size):
            batch = chunks[i:i + batch_size]
            batch_embs = embed_fn.embed_documents(batch)
            all_embeddings.extend(batch_embs)

            current = min(i + batch_size, total)
            progress = 30 + int(current / total * 50)
            await task.emit(
                "embedding",
                f"正在向量化({current}/{total})...",
                progress,
                current=current,
                total=total,
            )

        # 4. 写入向量库
        await task.emit("storing", "正在写入向量库...", 85)
        documents = [
            Document(
                page_content=chunks[i],
                metadata={"doc_id": doc_id, "source": task.filename, "user_id": user_id or "", "chunk_idx": i},
            )
            for i in range(total)
        ]
        # 使用自定义写入方式（带 embedding）
        store = vector_store.get_store()
        store.add_documents(documents)

        # 保存原始文件
        save_path = config.UPLOAD_DIR / f"{doc_id}_{task.filename}"
        save_path.write_bytes(file_bytes)

        # 5. 完成
        await task.finish(doc_id=doc_id, chunk_count=total)

    except Exception as e:
        await task.finish(error=str(e))


class QueryRequest(BaseModel):
    question: str
    top_k: int = 3
    structured: bool = False
    user_id: str = ""
    doc_ids: Optional[List[str]] = []
    mode: str = "knowledge"  # "knowledge" | "attachment"
    deep_thinking: bool = False


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


@router.post("/upload-stream")
async def upload_document_stream(
    file: UploadFile = File(...),
    user_id: str = Form(""),
    doc_id: str = Form(""),
):
    """上传文件并创建异步解析任务，返回 task_id 用于 SSE 进度监听

    - doc_id: 可选，由上游（Go后端）传入的文档ID，用于与COS记录对齐
    """
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(file.filename).suffix.lower()
    if ext not in document.PARSERS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {list(document.PARSERS.keys())}")

    file_bytes = await file.read()

    # 创建异步任务
    task = _create_parse_task(file.filename)

    # 启动后台处理协程
    asyncio.create_task(_process_document_async(task, file_bytes, user_id, doc_id))

    return {"task_id": task.task_id, "filename": file.filename}


@router.get("/progress/{task_id}")
async def get_document_progress(task_id: str):
    """SSE 流式推送文档解析进度"""
    task = _get_parse_task(task_id)
    if not task:
        raise HTTPException(404, "任务不存在或已过期")

    async def event_generator():
        # 立即推送当前状态
        yield _sse_json({
            "stage": task.stage,
            "message": task.message,
            "progress": task.progress,
            "total": task.total_chunks,
        })

        # 持续监听新事件
        while not task.done:
            try:
                event = await asyncio.wait_for(task._queue.get(), timeout=30.0)
                yield _sse_json(event)
                if event.get("stage") in ("completed", "failed"):
                    break
            except asyncio.TimeoutError:
                # 30 秒无新事件则发送心跳保持连接
                yield _sse_json({"stage": task.stage, "message": task.message, "progress": task.progress})

        # 任务已完成，再推一次最终状态确保前端收到
        final_event = {
            "stage": task.stage,
            "message": task.message,
            "progress": task.progress,
        }
        if task.doc_id:
            final_event["doc_id"] = task.doc_id
        if task.total_chunks:
            final_event["chunk_count"] = task.total_chunks
        if task.error:
            final_event["error"] = task.error
        yield _sse_json(final_event)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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

    # 深度思考模式：复用 chat 模块的 ReAct Agent 流程
    if req.deep_thinking:
        from routers.chat import _run_agent_stream, ChatRequest

        chat_req = ChatRequest(
            message=req.question,
            user_id=req.user_id,
            deep_thinking=True,
        )
        temp_session = uuid.uuid4().hex[:16]

        return StreamingResponse(
            _run_agent_stream(chat_req, temp_session, req.user_id, temp_session),
            media_type="text/event-stream",
        )

    docs = vector_store.list_documents(user_id=req.user_id)
    if not docs:
        raise HTTPException(400, "知识库为空，请先上传文档")

    # 如果前端指定了 doc_ids，优先检索附件文档
    manual_docs: List[Document] | None = None
    matched_doc_id: str | None = None
    attachment_docs: List[Dict] = []
    if req.doc_ids:
        for doc_id in req.doc_ids:
            results = vector_store.search_by_doc_id(req.question, doc_id, req.top_k, req.user_id)
            if req.user_id and not results:
                results = vector_store.search_by_doc_id(req.question, doc_id, req.top_k, "")
            attachment_docs.extend(results)

    # 附件模式：只查附件
    # 知识库模式 + 有附件：附件 + 补充知识库
    is_attachment = req.mode in ("attachment", "aiserver_attachment")
    is_knowledge = req.mode in ("knowledge", "aiserver_knowledge")
    if req.doc_ids and is_attachment:
        seen = set()
        deduped = []
        for r in sorted(attachment_docs, key=lambda x: x.get("score", 0), reverse=True):
            key = (r.get("doc_id", ""), r.get("content", ""))
            if key not in seen:
                seen.add(key)
                deduped.append(r)
        manual_docs = [
            Document(page_content=r["content"], metadata={"source": r["source"], "doc_id": r["doc_id"]})
            for r in deduped[: req.top_k]
        ]
    elif req.doc_ids and is_knowledge:
        # 知识库模式 + 有附件：先取附件，再补充知识库
        seen = set()
        all_results = []
        for r in sorted(attachment_docs, key=lambda x: x.get("score", 0), reverse=True):
            key = (r.get("doc_id", ""), r.get("content", ""))
            if key not in seen:
                seen.add(key)
                all_results.append(r)
        # 补充知识库检索（排除已检索的 doc_ids）
        if len(all_results) < req.top_k:
            remaining = req.top_k - len(all_results)
            store = vector_store.get_store()
            search_kwargs = {"k": remaining}
            if req.user_id:
                search_kwargs["filter"] = {"user_id": req.user_id}
            knowledge_results = store.similarity_search_with_score(req.question, **search_kwargs)
            for doc, score in knowledge_results:
                doc_id = doc.metadata.get("doc_id", "")
                if doc_id in req.doc_ids:
                    continue
                key = (doc_id, doc.page_content)
                if key not in seen:
                    seen.add(key)
                    all_results.append({
                        "content": doc.page_content,
                        "score": float(score),
                        "source": doc.metadata.get("source", ""),
                        "doc_id": doc_id,
                    })
        manual_docs = [
            Document(page_content=r["content"], metadata={"source": r["source"], "doc_id": r["doc_id"]})
            for r in all_results[: req.top_k]
        ]
    else:
        # 检测用户是否引用了某个特定文件名
        matched_doc_id = _extract_doc_id_from_query(req.question, docs)
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
    elif is_knowledge:
        # 知识库模式（且未匹配到文件名或 doc_ids）：全文检索知识库
        search_kwargs = {"k": req.top_k}
        if req.user_id:
            search_kwargs["filter"] = {"user_id": req.user_id}
        store = vector_store.get_store()
        retriever = store.as_retriever(search_kwargs=search_kwargs)
        context_fn = retriever | _format_docs
    else:
        # 附件模式但 doc_ids 为空：不提供任何上下文，让 LLM 基于自身知识回答
        context_fn = lambda _: ""

    # 根据是否匹配到文件名或 doc_ids 选择 Prompt
    active_prompt = SUMMARY_PROMPT if (matched_doc_id or req.doc_ids) else RAG_PROMPT

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
            # 先推送一个 retrieving 事件，让前端知道正在检索
            yield _sse_json({"content": "", "status": "retrieving", "message": "正在检索相关内容...", "done": False})

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
                first_chunk = True
                if hasattr(rag_chain, "astream"):
                    async for chunk in rag_chain.astream(req.question):
                        if first_chunk:
                            yield _sse_json({"content": "", "status": "generating", "message": "正在生成答案...", "done": False})
                            first_chunk = False
                        yield _sse_json({"content": chunk, "done": False})
                        await asyncio.sleep(0.08)
                else:
                    for chunk in rag_chain.stream(req.question):
                        if first_chunk:
                            yield _sse_json({"content": "", "status": "generating", "message": "正在生成答案...", "done": False})
                            first_chunk = False
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


@router.post("/{doc_id}/retry")
async def retry_knowledge(doc_id: str, user_id: str = Query("")):
    """重试失败的文档解析：删除旧向量，重新解析并入库"""
    # 查找原始文件
    files = list(config.UPLOAD_DIR.glob(f"{doc_id}_*"))
    if not files:
        raise HTTPException(404, f"未找到文档 {doc_id} 的原始文件")

    file_path = files[0]
    filename = file_path.name[len(doc_id) + 1:]  # 去掉前缀 "{doc_id}_"
    file_bytes = file_path.read_bytes()

    # 删除旧的向量数据
    vector_store.delete_document(doc_id, user_id=user_id)

    # 创建新的异步解析任务
    task = _create_parse_task(filename)
    asyncio.create_task(_process_document_async(task, file_bytes, user_id, doc_id))

    return {"task_id": task.task_id, "filename": filename, "doc_id": doc_id}

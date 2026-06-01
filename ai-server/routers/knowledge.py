import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from langchain_core.documents import Document
from qcloud_cos import CosConfig, CosS3Client

import config
from services.rag import document, embedding
from services.storage import vector_store

# ========== COS 客户端 ==========


def _get_cos_client() -> CosS3Client | None:
    if not config.COS_SECRET_ID or not config.COS_SECRET_KEY:
        return None
    cos_config = CosConfig(
        Region=config.COS_REGION,
        SecretId=config.COS_SECRET_ID,
        SecretKey=config.COS_SECRET_KEY,
    )
    return CosS3Client(cos_config)


def _upload_to_cos(file_bytes: bytes, key: str) -> str:
    """上传文件到腾讯云 COS，返回访问 URL"""
    client = _get_cos_client()
    if not client:
        return ""
    try:
        client.put_object(
            Bucket=config.COS_BUCKET,
            Body=file_bytes,
            Key=key,
        )
        return f"https://{config.COS_BUCKET}.cos.{config.COS_REGION}.myqcloud.com/{key}"
    except Exception as e:
        print(f"[COS] upload failed: {e}")
        return ""

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




async def _process_document_async(task: ParseTask, file_bytes: bytes, user_id: str = "", doc_id: str = "", created_at: str = ""):
    """后台协程：解析文档并实时推送进度（同步操作扔到线程池，不阻塞事件循环）"""
    try:
        # 1. 解析文件
        await task.emit("parsing", "正在解析文档...", 5)
        text = await asyncio.to_thread(document.parse_file, task.filename, file_bytes)
        if not text.strip():
            await task.finish(error="文件内容为空或无法提取文字")
            return

        # 2. 切片
        await task.emit("splitting", "正在切片...", 20)
        chunks = await asyncio.to_thread(document.split_text, text)
        if not chunks:
            await task.finish(error="文档拆分结果为空")
            return

        total = len(chunks)
        if not doc_id:
            doc_id = uuid.uuid4().hex[:12]

        parse_at = datetime.now(timezone.utc).isoformat()
        if not created_at:
            created_at = parse_at
        file_type = Path(task.filename).suffix.lower()

        # 3. 向量化（分批次，每批扔到线程池执行，不阻塞事件循环）
        await task.emit("embedding", f"正在向量化(0/{total})...", 30, total=total)

        embed_fn = embedding.get_embeddings()
        batch_size = 8
        all_embeddings: List[List[float]] = []

        for i in range(0, total, batch_size):
            batch = chunks[i:i + batch_size]
            batch_embs = await asyncio.to_thread(embed_fn.embed_documents, batch)
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

        # 4. 上传 COS + 写入向量库（同步操作扔线程池）
        await task.emit("storing", "正在写入向量库...", 85)
        cos_key = f"{config.COS_PREFIX}/{doc_id}_{task.filename}"
        cos_url = await asyncio.to_thread(_upload_to_cos, file_bytes, cos_key)

        documents = [
            Document(
                page_content=chunks[i],
                metadata={
                    "doc_id": doc_id,
                    "source": task.filename,
                    "file_type": file_type,
                    "created_at": created_at,
                    "parse_at": parse_at,
                    "cos_url": cos_url,
                    "user_id": user_id or "",
                    "chunk_idx": i,
                },
            )
            for i in range(total)
        ]
        store = vector_store.get_store()
        await asyncio.to_thread(store.add_documents, documents)

        # 保存原始文件（本地备份）
        save_path = config.UPLOAD_DIR / f"{doc_id}_{task.filename}"
        await asyncio.to_thread(save_path.write_bytes, file_bytes)

        # 5. 完成
        await task.finish(doc_id=doc_id, chunk_count=total)

    except Exception as e:
        await task.finish(error=str(e))


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(file.filename).suffix.lower()
    if ext not in document.PARSERS:
        raise HTTPException(400, f"不支持的格式: {ext}，支持: {list(document.PARSERS.keys())}")

    file_bytes = await file.read()

    # 所有同步操作扔到线程池执行，不阻塞事件循环，前端保持同步等待
    text = await asyncio.to_thread(document.parse_file, file.filename, file_bytes)
    if not text.strip():
        raise HTTPException(400, "文件内容为空或无法提取文字")

    chunks = await asyncio.to_thread(document.split_text, text)
    if not chunks:
        raise HTTPException(400, "文档拆分结果为空")

    doc_id = uuid.uuid4().hex[:12]
    file_type = Path(file.filename).suffix.lower()

    # 向量化（分批次扔到线程池）
    embed_fn = embedding.get_embeddings()
    batch_size = 8
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        await asyncio.to_thread(embed_fn.embed_documents, batch)

    # 上传 COS
    cos_key = f"{config.COS_PREFIX}/{doc_id}_{file.filename}"
    cos_url = await asyncio.to_thread(_upload_to_cos, file_bytes, cos_key)

    documents = [
        Document(
            page_content=chunk,
            metadata={
                "doc_id": doc_id,
                "source": file.filename,
                "file_type": file_type,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "parse_at": datetime.now(timezone.utc).isoformat(),
                "cos_url": cos_url,
            },
        )
        for chunk in chunks
    ]
    store = vector_store.get_store()
    await asyncio.to_thread(store.add_documents, documents)

    # 保存原始文件
    save_path = config.UPLOAD_DIR / f"{doc_id}_{file.filename}"
    await asyncio.to_thread(save_path.write_bytes, file_bytes)

    return {"code": 0, "data": {"knowledge_id": doc_id, "filename": file.filename, "chunks": len(chunks), "cos_url": cos_url}, "msg": "上传成功"}


@router.get("/list")
async def list_knowledge(user_id: str = Query("")):
    return {"code": 0, "data": {"documents": vector_store.list_documents(user_id=user_id)}, "msg": "获取成功"}


@router.delete("/{doc_id}")
async def delete_knowledge(doc_id: str, user_id: str = Query("")):
    ok = vector_store.delete_document(doc_id=doc_id, user_id=user_id)
    if not ok:
        raise HTTPException(404, f"文档 {doc_id} 不存在")

    for f in config.UPLOAD_DIR.glob(f"{doc_id}_*"):
        f.unlink()

    return {"code": 0, "msg": f"文档 {doc_id} 已删除"}


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

    # 保留原始 created_at，再删除旧向量
    docs = vector_store.list_documents(user_id=user_id)
    old_doc = next((d for d in docs if d["doc_id"] == doc_id), None)
    created_at = old_doc.get("created_at") if old_doc else ""

    vector_store.delete_document(doc_id=doc_id, user_id=user_id)

    # 创建新的异步解析任务
    task = _create_parse_task(filename=filename)
    asyncio.create_task(_process_document_async(
        task=task,
        file_bytes=file_bytes,
        user_id=user_id,
        doc_id=doc_id,
        created_at=created_at,
    ))

    return {"code": 0, "data": {"task_id": task.task_id, "filename": filename, "doc_id": doc_id}, "msg": "任务已创建"}

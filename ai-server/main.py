import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from models.conversation import init_db
from routers import knowledge, chat, conversation, upload
from services.middleware import AuthMiddleware
from services.storage import setup_checkpoints
from services.storage.long_term_memory import setup_store
from services.streaming import clear_all_graph_tasks, clear_all_buffers

app = FastAPI(
    title="AI Server", description="RAG 知识库问答 + AI 对话服务", version="2.0.0"
)

# FastAPI 中间件是栈式注册：后注册的先执行。
# 要让 CORS 处理 OPTIONS 预检请求，必须后注册 CORS（外层），先注册 Auth（内层）。
app.add_middleware(AuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge.router)
app.include_router(chat.router)
app.include_router(conversation.router)
app.include_router(upload.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ai_model": config.AI_MODEL,
        "embedding_model": config.EMBEDDING_MODEL,
    }


@app.on_event("startup")
async def check_config():
    if not config.AI_API_KEY:
        print("WARNING: AI_API_KEY 未配置，请在 .env 中设置")
    if not config.JWT_SIGNING_KEY:
        print("WARNING: JWT_SIGNING_KEY 未配置，认证功能将不可用")
    print(
        f"AI Server starting → model: {config.AI_MODEL}, embedding: {config.EMBEDDING_MODEL}"
    )
    # 初始化数据库表
    init_db()
    print("Database tables initialized")
    # 初始化 LangGraph checkpoint 表
    setup_checkpoints()
    print("Checkpoint tables initialized")
    # 初始化长期记忆 store 表
    setup_store()
    print("Long-term memory store tables initialized")
    # 清空旧版向量数据（metadata 格式变更后需要重建）
    # from services.storage import vector_store
    # try:
    #     cleared = vector_store.clear_old_documents()
    #     if cleared:
    #         print("Old vector data cleared (metadata format changed)")
    # except Exception as e:
    #     print(f"Vector data clear skipped: {e}")


@app.on_event("shutdown")
async def cleanup():
    """清理所有后台 Graph 任务和 StreamBuffer。"""
    clear_all_graph_tasks()
    clear_all_buffers()
    print("All background tasks and buffers cleaned up")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

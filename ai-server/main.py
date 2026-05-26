import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import config
from models.conversation import init_db
from routers import knowledge, chat, conversation
from services.auth_middleware import AuthMiddleware

app = FastAPI(title="AI Server", description="RAG 知识库问答 + AI 对话服务", version="2.0.0")

# 认证中间件（在 CORS 之后注册，确保 OPTIONS 预检请求不受认证影响）
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
    print(f"AI Server starting → model: {config.AI_MODEL}, embedding: {config.EMBEDDING_MODEL}")
    # 初始化数据库表
    init_db()
    print("Database tables initialized")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)



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
    print(f"AI Server starting → model: {config.AI_MODEL}, embedding: {config.EMBEDDING_MODEL}")
    # 初始化数据库表
    init_db()
    print("Database tables initialized")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

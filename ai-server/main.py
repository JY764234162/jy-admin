import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from routers import knowledge

app = FastAPI(title="AI Server", description="RAG 知识库问答服务", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:7777"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge.router)


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
    print(f"AI Server starting → model: {config.AI_MODEL}, embedding: {config.EMBEDDING_MODEL}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

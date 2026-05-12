import sys
import os
import jwt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from routers import knowledge, chat

app = FastAPI(title="AI Server", description="RAG 知识库问答服务", version="1.0.0")

# JWT 配置（与 Go 后端保持一致）
JWT_SECRET = os.getenv("JWT_SIGNING_KEY", "jy_admin")
JWT_ALGORITHM = "HS256"

# 公开路由（无需认证）
PUBLIC_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}


def _is_internal_ip(host: str) -> bool:
    """判断是否为 Docker 内网或本地地址，允许内部服务免 JWT"""
    if not host:
        return False
    if host in ("127.0.0.1", "localhost", "::1"):
        return True
    if host.startswith("172.") or host.startswith("192.168.") or host.startswith("10."):
        return True
    return False


@app.middleware("http")
async def jwt_auth_middleware(request: Request, call_next):
    """JWT 认证中间件：复用 Go 后端 token；Docker 内网请求免认证"""
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)

    # Docker 内网服务（如 Go 后端）调用时免 JWT
    client_host = request.client.host if request.client else ""
    if _is_internal_ip(client_host):
        return await call_next(request)

    auth = request.headers.get("Authorization")
    if not auth:
        return JSONResponse({"detail": "Missing token"}, status_code=401)

    try:
        token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else auth
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return JSONResponse({"detail": "Token expired"}, status_code=401)
    except jwt.InvalidTokenError:
        return JSONResponse({"detail": "Invalid token"}, status_code=401)

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:7777"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge.router)
app.include_router(chat.router)


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

"""全局认证中间件

在每个请求处理前验证 JWT，并将 user_id 注入 request.state，
供后续路由函数通过 request.state.user_id 获取，避免每个函数都写 Depends。
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .auth import verify_token


class AuthMiddleware(BaseHTTPMiddleware):
    """JWT 认证中间件。

    - 排除白名单路径（health、登录相关等）
    - 从 Authorization Header 提取 token 并验证
    - 将 user_id 放入 request.state.user_id
    """

    EXEMPT_PATHS = {
        "/api/health",
        "/docs",
        "/openapi.json",
        "/redoc",
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # 白名单直接放行
        if any(path.startswith(p) for p in self.EXEMPT_PATHS):
            return await call_next(request)

        # 提取 token
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            try:
                user = verify_token(token)
                if user:
                    request.state.user_id = user.id
                    request.state.user = user
            except Exception as e:
                return JSONResponse(
                    status_code=401,
                    content={"code": 401, "msg": str(e), "data": None},
                )
        else:
            # 未提供 token，但某些路径可能允许匿名访问
            # 这里统一要求认证（后续可根据需要调整）
            return JSONResponse(
                status_code=401,
                content={"code": 401, "msg": "缺少 Authorization Header", "data": None},
            )

        return await call_next(request)

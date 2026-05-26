"""JWT 认证中间件

与 Go 后端使用相同的 HS256 签名算法和 Claims 结构，
确保前端用同一个 token 就能访问 ai-server。
"""

import os
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Header, HTTPException, Request
from pydantic import BaseModel


class UserContext(BaseModel):
    """从 JWT 中解析出的用户信息"""

    id: int
    username: str = ""
    role_id: int = 0


JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", "")


def verify_token(token: str) -> Optional[UserContext]:
    """验证 JWT token，返回用户信息或 None"""
    if not JWT_SIGNING_KEY:
        # 开发环境未配置 key 时，允许通过（但不推荐）
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SIGNING_KEY,
            algorithms=["HS256"],
            audience="GVA",
            options={"verify_exp": True},
        )
        return UserContext(
            id=int(payload.get("ID", 0)),
            username=payload.get("Username", ""),
            role_id=int(payload.get("RoleId", 0)),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的 Token")


def get_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[UserContext]:
    """FastAPI Dependency：从 Authorization Header 提取并验证 JWT

    用法：
        @router.post("/conversation")
        async def create(req: ..., user: UserContext = Depends(get_current_user)):
            ...
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="缺少 Authorization Header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authorization 格式错误，应为 Bearer <token>")

    return verify_token(token)

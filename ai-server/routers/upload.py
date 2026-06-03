"""文件上传接口 —— 仅上传 COS，不向量化。

职责：供聊天附件上传使用，文件仅存储到腾讯云 COS，
      不解析、不切片、不入向量库。
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from qcloud_cos import CosConfig, CosS3Client

import config

router = APIRouter(prefix="/api/ai/upload", tags=["upload"])

# 允许上传的格式（聊天附件）
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".txt"}


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


@router.post("")
async def upload_chat_attachment(file: UploadFile = File(...)):
    """上传聊天附件（仅存储 COS，不向量化）。

    支持格式：jpg, jpeg, png, gif, webp, txt
    返回：{url, filename, file_type}
    """
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            400,
            f"不支持的格式: {ext}，仅支持: {', '.join(ALLOWED_EXTS)}"
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "文件不能为空")

    # 生成唯一 key
    file_id = uuid.uuid4().hex[:12]
    cos_key = f"{config.COS_PREFIX}/chat/{file_id}_{file.filename}"
    cos_url = _upload_to_cos(file_bytes, cos_key)

    if not cos_url:
        raise HTTPException(500, "上传 COS 失败")

    return {
        "code": 0,
        "data": {
            "url": cos_url,
            "filename": file.filename,
            "file_type": ext,
            "file_id": file_id,
        },
        "msg": "上传成功",
    }

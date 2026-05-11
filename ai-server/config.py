import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent

# LLM 配置
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o")

# Embedding 配置（本地 HuggingFace 模型）
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-zh")

# PostgreSQL + pgvector 配置（优先）
PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = os.getenv("PG_PORT", "5433")
PG_DB = os.getenv("PG_DB", "ai_vectors")
PG_USER = os.getenv("PG_USER", "ai_admin")
PG_PASSWORD = os.getenv("PG_PASSWORD", "ai123456")

PG_CONNECTION_STRING = (
    f"postgresql+psycopg://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}"
)

# SQLite 备用配置（Docker 不可用时）
USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"
SQLITE_PATH = BASE_DIR / os.getenv("SQLITE_PATH", "vector_data/memory.db")
SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)

# 文件目录
UPLOAD_DIR = BASE_DIR / os.getenv("UPLOAD_DIR", "uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# 向量存储目录（SQLite 模式下用）
VECTOR_DIR = BASE_DIR / os.getenv("VECTOR_DIR", "vector_data")
VECTOR_DIR.mkdir(exist_ok=True)

# 文档拆分
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

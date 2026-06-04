import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent

# LLM 配置（主模型：用于对话回复）
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o")

# 摘要模型配置（独立配置，可与大模型不同以节省成本）
# 默认 fallback 到主模型配置，如需区分请在 .env 中单独设置
SUMMARY_API_KEY = os.getenv("SUMMARY_API_KEY", AI_API_KEY)
SUMMARY_BASE_URL = os.getenv("SUMMARY_BASE_URL", AI_BASE_URL)
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", AI_MODEL)

# Embedding 配置（云端模型）
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-v3")
# Embedding 独立 API 配置（默认 fallback 到主模型配置）
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", AI_API_KEY)
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", AI_BASE_URL)

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

# 腾讯云 COS 配置
COS_SECRET_ID = os.getenv("COS_SECRET_ID", "")
COS_SECRET_KEY = os.getenv("COS_SECRET_KEY", "")
COS_BUCKET = os.getenv("COS_BUCKET", "jiangyi-knowledge")
COS_REGION = os.getenv("COS_REGION", "ap-beijing")
# 部署环境标识（local/test/prod），用于区分不同环境的 COS 存储路径
DEPLOY_ENV = os.getenv("DEPLOY_ENV", "local")

# Tavily 搜索
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# 多模态配置（GLM-4V）
GLM4V_API_KEY = os.getenv("GLM4V_API_KEY", "")
GLM4V_BASE_URL = os.getenv("GLM4V_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
GLM4V_MODEL = os.getenv("GLM4V_MODEL", "glm-4v-plus")

# 文档拆分
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

# JWT 配置（与 Go 后端共用同一个签名密钥）
JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", "")

# LangSmith 可观测性配置
LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", "false").lower() == "true"
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY", "")
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "jy-admin")
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")

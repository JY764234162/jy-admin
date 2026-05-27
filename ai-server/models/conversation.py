from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

import config

Base = declarative_base()


class Conversation(Base):
    """AI 会话元数据表（消息内容由 Checkpoint 管理）"""

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(255), nullable=False, default="")
    last_msg = Column(Text, nullable=False, default="")
    message_count = Column(Integer, nullable=False, default=0)
    latest_status = Column(String(50), nullable=False, default="success")
    latest_attachments = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


# ========== 数据库引擎和会话工厂 ==========
# 复用 ai-server 已有的 PostgreSQL 配置，但连接到主数据库
# 向量数据仍用 ai_vectors，对话历史也放在同一个 PG 实例中
_engine = create_engine(config.PG_CONNECTION_STRING, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)


def init_db():
    """初始化数据库表（如果不存在则创建）"""
    Base.metadata.create_all(bind=_engine)
    _migrate_conversations_table()


def _migrate_conversations_table():
    """迁移 conversations 表：添加 checkpoint 兼容所需的元数据字段。"""
    from sqlalchemy import inspect, text

    inspector = inspect(_engine)
    columns = [c["name"] for c in inspector.get_columns("conversations")]

    with _engine.begin() as conn:
        if "latest_status" not in columns:
            conn.execute(
                text("ALTER TABLE conversations ADD COLUMN latest_status VARCHAR(50) NOT NULL DEFAULT 'success'")
            )
            print("[migrate] Added conversations.latest_status")
        if "latest_attachments" not in columns:
            conn.execute(
                text("ALTER TABLE conversations ADD COLUMN latest_attachments TEXT NOT NULL DEFAULT '[]'")
            )
            print("[migrate] Added conversations.latest_attachments")


def get_db():
    """FastAPI Dependency：每次请求获取一个 DB Session，用完关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

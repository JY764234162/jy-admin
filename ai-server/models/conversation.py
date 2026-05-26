from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Index,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

import config

Base = declarative_base()


class Conversation(Base):
    """AI 会话表（对应 Go 后端 AIConversation）"""

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(255), nullable=False, default="")
    last_msg = Column(Text, nullable=False, default="")
    message_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at.desc()",
    )


class Message(Base):
    """AI 消息表（对应 Go 后端 AIMessage）"""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(50), nullable=False)  # user / assistant
    content = Column(Text, nullable=False, default="")
    user_id = Column(Integer, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="success")  # success / loading / error
    attachments = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


# ========== 数据库引擎和会话工厂 ==========
# 复用 ai-server 已有的 PostgreSQL 配置，但连接到主数据库
# 向量数据仍用 ai_vectors，对话历史也放在同一个 PG 实例中
_engine = create_engine(config.PG_CONNECTION_STRING, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)


def init_db():
    """初始化数据库表（如果不存在则创建）"""
    Base.metadata.create_all(bind=_engine)


def get_db():
    """FastAPI Dependency：每次请求获取一个 DB Session，用完关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""LangGraph Checkpoint 存储封装。

使用 PostgreSQL 作为 checkpoint 后端，与现有 pgvector 容器共用同一个数据库实例。
"""

from typing import List, Optional

from langchain_core.messages import BaseMessage, messages_from_dict
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import psycopg

import config

_pool: Optional[psycopg.Connection] = None
_saver: Optional[PostgresSaver] = None
_async_saver: Optional[AsyncPostgresSaver] = None


def _get_pool() -> psycopg.Connection:
    """获取 psycopg 连接（同步，autocommit 模式）。"""
    global _pool
    if _pool is None or _pool.closed:
        # psycopg 需要纯 postgresql:// 连接字符串（去掉 SQLAlchemy 的 +psycopg 驱动标识）
        conn_str = config.PG_CONNECTION_STRING.replace("postgresql+psycopg", "postgresql")
        _pool = psycopg.connect(conn_str)
        _pool.autocommit = True
    return _pool


def get_saver() -> PostgresSaver:
    """获取 PostgresSaver 单例。"""
    global _saver
    if _saver is None:
        conn = _get_pool()
        _saver = PostgresSaver(conn=conn)
    return _saver


def setup_checkpoints() -> None:
    """初始化 checkpoint 表（startup 时调用）。"""
    conn = _get_pool()
    # setup() 内部迁移脚本使用 CREATE INDEX CONCURRENTLY，需要 autocommit 模式
    conn.autocommit = True
    saver = PostgresSaver(conn=conn)
    saver.setup()
    print("[checkpoint] Checkpoint tables initialized")


def get_thread_config(thread_id: str) -> dict:
    """构造 LangGraph thread 配置。"""
    return {"configurable": {"thread_id": thread_id}}


def get_thread_messages(thread_id: str) -> List[BaseMessage]:
    """从 checkpoint 读取某会话的完整消息历史。

    Args:
        thread_id: 会话唯一标识（格式: "{user_id}:{conversation_id}"）

    Returns:
        按时间正序排列的消息列表
    """
    saver = get_saver()
    cfg = get_thread_config(thread_id)
    checkpoint_tuple = saver.get_tuple(cfg)

    if checkpoint_tuple is None:
        return []

    # checkpoint 的 channel_values 中存储了 MessagesState 的 messages 字段
    channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
    raw_messages = channel_values.get("messages", [])

    if not raw_messages:
        return []

    # raw_messages 可能是序列化后的 dict 列表，反序列化
    try:
        if isinstance(raw_messages, list) and len(raw_messages) > 0:
            if isinstance(raw_messages[0], BaseMessage):
                return list(raw_messages)
            # 序列化后的 dict
            return messages_from_dict(raw_messages)
    except Exception:
        pass

    return []


async def get_async_saver() -> AsyncPostgresSaver:
    """获取 AsyncPostgresSaver 单例（供异步流式调用使用）。"""
    global _async_saver
    if _async_saver is None:
        conn_str = config.PG_CONNECTION_STRING.replace("postgresql+psycopg", "postgresql")
        conn = await psycopg.AsyncConnection.connect(conn_str, autocommit=True)
        _async_saver = AsyncPostgresSaver(conn=conn)
    return _async_saver


def delete_thread(thread_id: str) -> None:
    """删除某会话的 checkpoint 数据。"""
    saver = get_saver()
    cfg = get_thread_config(thread_id)
    saver.delete_thread(cfg)


def thread_exists(thread_id: str) -> bool:
    """判断某会话是否有 checkpoint 数据。"""
    saver = get_saver()
    cfg = get_thread_config(thread_id)
    return saver.get_tuple(cfg) is not None

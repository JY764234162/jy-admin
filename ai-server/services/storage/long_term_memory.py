"""基于 PostgresStore 的跨会话长期记忆存储。

替代原有的 SemanticMemory（PGVector），使用统一的 PostgreSQL 存储：
- 历史对话交互的语义检索
- 用户偏好的精确存储
"""

import time
from functools import lru_cache
from typing import Optional

import psycopg
from langgraph.store.postgres import PostgresStore

import config
from services.rag.embedding import embed_documents

_conn_str = config.PG_CONNECTION_STRING.replace("postgresql+psycopg", "postgresql")
_store: Optional[PostgresStore] = None


def _get_store() -> PostgresStore:
    """获取 PostgresStore 单例。"""
    global _store
    if _store is None:
        conn = psycopg.connect(_conn_str)
        conn.autocommit = True
        _store = PostgresStore(
            conn,
            index={
                "dims": 1024,  # text-embedding-v3 的向量维度
                "embed": embed_documents,  # list[str] -> list[list[float]]
            },
        )
    return _store


def setup_store() -> None:
    """初始化 store 表（startup 时调用）。"""
    store = _get_store()
    store.setup()
    print("[store] Long-term memory store tables initialized")


# ========== 历史交互语义记忆（替代 SemanticMemory）==========

class LongTermMemory:
    """长期语义记忆：跨会话检索相关历史交互。

    底层使用 PostgresStore 的向量索引，替代原 PGVector 方案。
    """

    def __init__(self, top_k: int = 5):
        self.top_k = top_k
        self._store_instance: Optional[PostgresStore] = None

    @property
    def store(self) -> PostgresStore:
        if self._store_instance is None:
            self._store_instance = _get_store()
        return self._store_instance

    def save_interaction(
        self, user_msg: str, ai_msg: str, session_id: str, user_id: str = ""
    ) -> None:
        """保存一轮完整的对话交互，用于长期语义检索。"""
        combined = f"User: {user_msg}\nAssistant: {ai_msg}"
        self.store.put(
            ("memory", str(user_id)),
            f"{session_id}:{int(time.time())}",
            {
                "user": user_msg,
                "ai": ai_msg,
                "session_id": session_id,
                "timestamp": time.time(),
                "text": combined,
            },
        )

    def retrieve(self, query: str, user_id: str = "") -> str:
        """语义检索与当前问题最相关的历史交互。"""
        results = self.store.search(
            ("memory", str(user_id)),
            query=query,
            limit=self.top_k,
        )
        if not results:
            return ""

        memories = []
        for item in results:
            data = item.value
            memories.append(f"User: {data.get('user', '')}\nAssistant: {data.get('ai', '')}")

        return "\n\n---\n\n".join(memories)

    def format_memory_context(self, query: str, user_id: str = "") -> str:
        """将检索到的记忆格式化为可注入 prompt 的上下文文本。"""
        memory_text = self.retrieve(query, user_id)
        if not memory_text:
            return ""
        return (
            "以下是你与用户的部分历史对话记录（按语义相关性召回），"
            "请在回答时参考这些上下文。如果历史记录与当前问题无关，请忽略它们。\n\n"
            f"{memory_text}"
        )


# ========== 用户偏好精确存储 ==========

class UserPreferences:
    """用户偏好存储：精确的键值读写，不支持语义搜索。"""

    def __init__(self):
        self._store_instance: Optional[PostgresStore] = None

    @property
    def store(self) -> PostgresStore:
        if self._store_instance is None:
            self._store_instance = _get_store()
        return self._store_instance

    def set_preference(self, user_id: str, key: str, value: dict) -> None:
        """设置用户的某项偏好。"""
        self.store.put(("users", str(user_id), "preferences"), key, value)

    def get_preference(self, user_id: str, key: str) -> Optional[dict]:
        """读取用户的某项偏好。"""
        item = self.store.get(("users", str(user_id), "preferences"), key)
        return item.value if item else None

    def get_all_preferences(self, user_id: str) -> dict:
        """读取用户的所有偏好。"""
        results = self.store.search(
            ("users", str(user_id), "preferences"),
            limit=100,
        )
        return {item.key: item.value for item in results}


# 向后兼容：提供与原 SemanticMemory 相同的接口
@lru_cache(maxsize=1)
def get_memory(top_k: int = 5) -> LongTermMemory:
    """获取长期记忆实例（替代原来的 SemanticMemory）。"""
    return LongTermMemory(top_k=top_k)

import json
import uuid
import sqlite3
from typing import List, Dict, Optional

import config


class ConversationMemory:
    """基于 SQLite 的对话记忆管理"""

    def __init__(self):
        self.db_path = str(config.SQLITE_PATH)
        self._ensure_tables()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _ensure_tables(self):
        """创建对话记忆表"""
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    def create_conversation(self, title: str = None) -> str:
        """创建新对话"""
        conv_id = uuid.uuid4().hex[:16]
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO chat_conversations (id, title) VALUES (?, ?)",
                (conv_id, title or "新对话")
            )
            conn.commit()
        return conv_id

    def add_message(self, conversation_id: str, role: str, content: str):
        """添加消息"""
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
                (conversation_id, role, content)
            )
            conn.execute(
                "UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,)
            )
            conn.commit()

    def get_messages(self, conversation_id: str, limit: int = 50) -> List[Dict]:
        """获取对话历史"""
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT role, content, created_at
                FROM chat_messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (conversation_id, limit)
            ).fetchall()
            return [
                {"role": row["role"], "content": row["content"], "created_at": str(row["created_at"])}
                for row in rows
            ]

    def get_conversations(self) -> List[Dict]:
        """获取所有对话列表"""
        with self._get_conn() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM chat_conversations
                ORDER BY updated_at DESC
                """
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "created_at": str(row["created_at"]),
                    "updated_at": str(row["updated_at"])
                }
                for row in rows
            ]

    def delete_conversation(self, conversation_id: str) -> bool:
        """删除对话"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "DELETE FROM chat_conversations WHERE id = ?",
                (conversation_id,)
            )
            conn.commit()
            return cursor.rowcount > 0


# 全局实例
memory = ConversationMemory()

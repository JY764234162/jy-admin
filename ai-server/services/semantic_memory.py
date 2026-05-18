import time
from typing import List, Optional

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.documents import Document
from langchain_community.vectorstores import PGVector
from sqlalchemy import create_engine, text

import config
from services import embedding

_connection_string = config.PG_CONNECTION_STRING
# 短期记忆（消息窗口）+ 长期语义记忆共用同一个 collection，通过 metadata 区分
_collection_name = "semantic_memory"


class VectorChatMessageHistory(BaseChatMessageHistory):
    """基于 PGVector 的 ChatMessageHistory，所有消息存入向量库。

    - messages 只返回最近 N 条（窗口限制，防止 token 爆炸）
    - add_message 将消息向量化存入向量库，供后续语义检索
    """

    def __init__(self, session_id: str, user_id: str = "", max_messages: int = 10):
        self.session_id = session_id
        self.user_id = user_id
        self.max_messages = max_messages
        self._store = PGVector(
            connection_string=_connection_string,
            collection_name=_collection_name,
            embedding_function=embedding.get_embeddings(),
        )
        self._engine = create_engine(_connection_string)

    @property
    def messages(self) -> List[BaseMessage]:
        """获取当前会话最近 N 条消息（按时间正序）。"""
        with self._engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT document, cmetadata
                    FROM langchain_pg_embedding
                    WHERE collection_id = (
                        SELECT uuid FROM langchain_pg_collection WHERE name = :name
                    )
                    AND cmetadata->>'session_id' = :session_id
                    AND cmetadata->>'type' = 'message'
                    ORDER BY (cmetadata->>'timestamp')::float ASC
                    LIMIT :limit
                """),
                {
                    "name": _collection_name,
                    "session_id": self.session_id,
                    "limit": self.max_messages * 2,  # 留出余量，取最近 N 轮
                },
            )
            rows = result.fetchall()
            msgs: List[BaseMessage] = []
            for row in rows:
                role = row.cmetadata.get("role", "human")
                content = row.document
                if role == "human":
                    msgs.append(HumanMessage(content=content))
                elif role == "ai":
                    msgs.append(AIMessage(content=content))
                elif role == "system":
                    msgs.append(SystemMessage(content=content))
            # 只保留最近 max_messages 条
            return msgs[-self.max_messages :] if len(msgs) > self.max_messages else msgs

    def add_message(self, message: BaseMessage) -> None:
        """将单条消息存入向量库。"""
        role = "human"
        if isinstance(message, AIMessage):
            role = "ai"
        elif isinstance(message, SystemMessage):
            role = "system"

        doc = Document(
            page_content=message.content,
            metadata={
                "session_id": self.session_id,
                "user_id": self.user_id,
                "role": role,
                "timestamp": time.time(),
                "type": "message",
            },
        )
        self._store.add_documents([doc])

    def add_messages(self, messages: List[BaseMessage]) -> None:
        """批量添加消息。"""
        docs: List[Document] = []
        for message in messages:
            role = "human"
            if isinstance(message, AIMessage):
                role = "ai"
            elif isinstance(message, SystemMessage):
                role = "system"
            docs.append(
                Document(
                    page_content=message.content,
                    metadata={
                        "session_id": self.session_id,
                        "user_id": self.user_id,
                        "role": role,
                        "timestamp": time.time(),
                        "type": "message",
                    },
                )
            )
        if docs:
            self._store.add_documents(docs)

    def clear(self) -> None:
        """清空当前会话的所有消息。"""
        with self._engine.connect() as conn:
            conn.execute(
                text("""
                    DELETE FROM langchain_pg_embedding
                    WHERE collection_id = (
                        SELECT uuid FROM langchain_pg_collection WHERE name = :name
                    )
                    AND cmetadata->>'session_id' = :session_id
                    AND cmetadata->>'type' = 'message'
                """),
                {"name": _collection_name, "session_id": self.session_id},
            )
            conn.commit()


class SemanticMemory:
    """语义长期记忆：跨会话检索相关历史交互，防止 token 爆炸。

    - 每次对话结束后保存完整的 user + assistant 交互
    - 新对话时用当前问题做语义检索，召回最相关的 top_k 条历史
    """

    def __init__(self, top_k: int = 5):
        self.top_k = top_k
        self._store = PGVector(
            connection_string=_connection_string,
            collection_name=_collection_name,
            embedding_function=embedding.get_embeddings(),
        )
        self._engine = create_engine(_connection_string)

    def save_interaction(
        self, user_msg: str, ai_msg: str, session_id: str, user_id: str = ""
    ) -> None:
        """保存一轮完整的对话交互（User + Assistant），用于长期语义检索。"""
        combined = f"User: {user_msg}\nAssistant: {ai_msg}"
        doc = Document(
            page_content=combined,
            metadata={
                "session_id": session_id,
                "user_id": user_id,
                "type": "interaction",
                "timestamp": time.time(),
            },
        )
        self._store.add_documents([doc])

    def retrieve(self, query: str, user_id: str = "") -> str:
        """语义检索与当前问题最相关的历史交互，返回格式化的记忆文本。"""
        kwargs: dict = {"k": self.top_k}
        if user_id:
            kwargs["filter"] = {"user_id": user_id, "type": "interaction"}
        else:
            kwargs["filter"] = {"type": "interaction"}

        docs = self._store.similarity_search(query, **kwargs)
        if not docs:
            return ""

        memories = []
        for doc in docs:
            memories.append(doc.page_content)

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

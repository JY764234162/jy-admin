import requests
from langchain_core.embeddings import Embeddings

import config


class MiniMaxEmbeddings(Embeddings):
    """MiniMax 云 Embedding API，遵循 LangChain Embeddings 接口"""

    def __init__(self, api_key: str = None, base_url: str = None, model: str = None):
        self.api_key = api_key or config.MINIMAX_API_KEY
        self.base_url = (base_url or config.MINIMAX_BASE_URL).rstrip("/")
        self.model = model or config.EMBEDDING_MODEL

    def _call_api(self, texts: list[str]) -> list[list[float]]:
        url = f"{self.base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "texts": texts,
            "type": "db",
        }
        resp = requests.post(url, headers=headers, json=body, timeout=60)
        resp.raise_for_status()
        data = resp.json()

        # 兼容多种响应格式
        if "vectors" in data:
            return data["vectors"]
        if "data" in data:
            return [item["embedding"] for item in data["data"]]
        if "embeddings" in data:
            return data["embeddings"]
        raise ValueError(f"Unknown MiniMax response format: {list(data.keys())}")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._call_api(texts)

    def embed_query(self, text: str) -> list[float]:
        result = self._call_api([text])
        return result[0] if result else []


# 全局实例（懒加载）
_minimax_embeddings: MiniMaxEmbeddings | None = None


def get_embeddings() -> MiniMaxEmbeddings:
    """获取全局 MiniMax Embeddings 实例"""
    global _minimax_embeddings
    if _minimax_embeddings is None:
        _minimax_embeddings = MiniMaxEmbeddings()
    return _minimax_embeddings


# 向后兼容的便捷函数
def embed_documents(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return get_embeddings().embed_query(text)

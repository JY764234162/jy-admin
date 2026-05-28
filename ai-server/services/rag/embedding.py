from langchain_openai import OpenAIEmbeddings

import config

_DEFAULT_MODEL = "text-embedding-v3"


class CloudEmbeddings:
    """云端 Embedding（阿里百炼 text-embedding-v3），不消耗本地 CPU"""

    def __init__(self, model_name: str = None):
        self._embeddings = OpenAIEmbeddings(
            model=model_name or getattr(config, "EMBEDDING_MODEL", _DEFAULT_MODEL),
            openai_api_key=config.AI_API_KEY,
            openai_api_base=config.AI_BASE_URL,
            dimensions=1024,
            chunk_size=8,
            check_embedding_ctx_length=False,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # 过滤空字符串，避免百炼 API 报错
        filtered = [t for t in texts if t and t.strip()]
        if not filtered:
            return []
        return self._embeddings.embed_documents(filtered)

    def embed_query(self, text: str) -> list[float]:
        return self._embeddings.embed_query(text)


# 全局实例（懒加载）
_cloud_embeddings: CloudEmbeddings | None = None


def get_embeddings() -> CloudEmbeddings:
    """获取全局云端 Embeddings 实例"""
    global _cloud_embeddings
    if _cloud_embeddings is None:
        _cloud_embeddings = CloudEmbeddings()
    return _cloud_embeddings


# 向后兼容的便捷函数
def embed_documents(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return get_embeddings().embed_query(text)

from langchain_community.embeddings import HuggingFaceEmbeddings

import config

# 本地 Embedding 模型（中文场景推荐 BAAI/bge-small-zh）
# 模型首次使用时会自动从 HuggingFace Hub 下载到本地缓存（~100MB）
# 后续完全离线本地推理
_DEFAULT_MODEL = "BAAI/bge-small-zh"


class LocalEmbeddings:
    """本地 HuggingFace Embedding，不依赖外部云 API"""

    def __init__(self, model_name: str = None):
        self._embeddings = HuggingFaceEmbeddings(
            model_name=model_name or getattr(config, "EMBEDDING_MODEL", _DEFAULT_MODEL),
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embeddings.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._embeddings.embed_query(text)


# 全局实例（懒加载）
_local_embeddings: LocalEmbeddings | None = None


def get_embeddings() -> LocalEmbeddings:
    """获取全局本地 Embeddings 实例"""
    global _local_embeddings
    if _local_embeddings is None:
        _local_embeddings = LocalEmbeddings()
    return _local_embeddings


# 向后兼容的便捷函数
def embed_documents(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return get_embeddings().embed_query(text)

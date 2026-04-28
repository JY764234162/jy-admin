import re
from collections import Counter
from typing import List

import numpy as np
from langchain_core.embeddings import Embeddings

EMBEDDING_DIM = 256


class TFIDFEmbeddings(Embeddings):
    """本地 TF-IDF 向量化，不需要外部 API"""

    def _tokenize(self, text: str) -> List[str]:
        text = text.lower()
        tokens = re.findall(r"[a-zA-Z]+|[一-鿿]|[0-9]+", text)
        bigrams = [tokens[i] + tokens[i + 1] for i in range(len(tokens) - 1)]
        return tokens + bigrams

    def _vectorize(self, text: str) -> np.ndarray:
        tokens = self._tokenize(text)
        if not tokens:
            return np.zeros(EMBEDDING_DIM, dtype=np.float32)

        token_counts = Counter(tokens)
        vec = np.zeros(EMBEDDING_DIM, dtype=np.float32)

        for token, count in token_counts.most_common(EMBEDDING_DIM):
            tf = count / len(tokens)
            idx = hash(token) % EMBEDDING_DIM
            vec[idx] += tf

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        return [self._vectorize(t).tolist() for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._vectorize(text).tolist()


# 模块级便捷函数
_embedder = TFIDFEmbeddings()


def embed_documents(texts: List[str]) -> List[List[float]]:
    return _embedder.embed_documents(texts)


def embed_query(text: str) -> List[float]:
    return _embedder.embed_query(text)

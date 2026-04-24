import re
from collections import Counter

import numpy as np

EMBEDDING_DIM = 256


def _tokenize(text: str) -> list[str]:
    text = text.lower()
    tokens = re.findall(r"[a-zA-Z]+|[一-鿿]|[0-9]+", text)
    bigrams = [tokens[i] + tokens[i + 1] for i in range(len(tokens) - 1)]
    return tokens + bigrams


def _tf_idf_vector(text: str) -> np.ndarray:
    tokens = _tokenize(text)
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


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return [_tf_idf_vector(t).tolist() for t in texts]


def embed_query(text: str) -> list[float]:
    return _tf_idf_vector(text).tolist()

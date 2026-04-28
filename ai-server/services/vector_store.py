import json
from pathlib import Path
from typing import List, Dict

import numpy as np

import config

META_FILE = config.VECTOR_DIR / "metadata.json"


def _load_meta() -> dict:
    if META_FILE.exists():
        return json.loads(META_FILE.read_text("utf-8"))
    return {"documents": {}}


def _save_meta(meta: dict):
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")


def _vec_path(doc_id: str) -> Path:
    return config.VECTOR_DIR / f"{doc_id}.npy"


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def add_documents(doc_id: str, filename: str, chunks: List[str], embeddings: List[List[float]]):
    vectors = np.array(embeddings, dtype=np.float32)
    np.save(str(_vec_path(doc_id)), vectors)

    meta = _load_meta()
    meta["documents"][doc_id] = {
        "filename": filename,
        "chunks": chunks,
        "chunk_count": len(chunks),
    }
    _save_meta(meta)


def search(query_embedding: List[float], top_k: int = 3) -> List[Dict]:
    query_vec = np.array(query_embedding, dtype=np.float32)

    results = []
    meta = _load_meta()
    for doc_id, doc_meta in meta["documents"].items():
        vec_path = _vec_path(doc_id)
        if not vec_path.exists():
            continue
        vectors = np.load(str(vec_path))
        for idx in range(len(vectors)):
            score = _cosine_similarity(query_vec, vectors[idx])
            results.append({
                "content": doc_meta["chunks"][idx],
                "score": score,
                "source": doc_meta["filename"],
                "doc_id": doc_id,
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]


def list_documents() -> List[Dict]:
    meta = _load_meta()
    return [
        {"doc_id": doc_id, **info}
        for doc_id, info in meta["documents"].items()
    ]


def delete_document(doc_id: str) -> bool:
    meta = _load_meta()
    if doc_id not in meta["documents"]:
        return False
    del meta["documents"][doc_id]
    _save_meta(meta)
    vec_path = _vec_path(doc_id)
    if vec_path.exists():
        vec_path.unlink()
    return True

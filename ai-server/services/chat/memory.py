"""Chat 模块：长期记忆单例。"""

from services.storage.long_term_memory import get_memory

semantic_memory = get_memory(top_k=5)

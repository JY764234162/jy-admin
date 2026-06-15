"""专业化 Worker 模块集合。

职责：为不同任务类型提供专门的 worker 工厂函数：
      - chat_worker：纯闲聊，无工具
      - direct_worker：单意图直接执行，按需绑定单一工具
      - knowledge_worker：知识库查询专用 ReAct 循环
      - search_worker：联网搜索专用 ReAct 循环
      - synthesis_worker：结果综合与最终回复生成
"""

from .chat_worker import _make_chat_worker
from .direct_worker import _make_direct_worker
from .knowledge_worker import _make_knowledge_worker
from .search_worker import _make_search_worker
from .synthesis_worker import _make_synthesis_worker

__all__ = [
    "_make_chat_worker",
    "_make_direct_worker",
    "_make_knowledge_worker",
    "_make_search_worker",
    "_make_synthesis_worker",
]

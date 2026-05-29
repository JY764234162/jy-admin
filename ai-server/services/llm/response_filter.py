"""回答内容过滤：删除工具名和工具调用描述，防止泄露给前端。"""

import re

# 需要过滤的工具名
_TOOL_NAMES = [
    "search_knowledge",
    "list_knowledge",
    "calculator",
    "tavilysearch",
]

# 常见工具调用描述模式（中文）
_TOOL_PATTERNS = [
    # 我调用了 xxx 工具
    r"我(?:已经|刚刚)?[调使]用了\s*[`"]?(?:search_knowledge|list_knowledge|calculator|tavilysearch)[`"]?\s*(?:工具)?[，。]?",
    # 调用 xxx
    r"(?:通过|借助|使用|调用)\s*[`"]?(?:search_knowledge|list_knowledge|calculator|tavilysearch)[`"]?\s*(?:工具)?[，。]?",
    # xxx 工具返回/告诉我
    r"(?:search_knowledge|list_knowledge|calculator|tavilysearch)\s*(?:工具)?\s*(?:返回|告诉我|显示|给出)[了，。]?",
    # 根据 xxx 的结果
    r"根据\s*(?:search_knowledge|list_knowledge|calculator|tavilysearch)\s*(?:工具)?\s*的?[结果查询][，。]?",
    # 我用 xxx 查了一下
    r"我(?:用|通过)\s*(?:search_knowledge|list_knowledge|calculator|tavilysearch)\s*(?:工具)?\s*查[了查]?[，。]?",
]

# 合并为统一正则
_TOOL_PATTERN_RE = re.compile("|".join(_TOOL_PATTERNS))


def sanitize_response(text: str) -> str:
    """清洗回答内容，删除工具名和工具调用描述。

    Args:
        text: 模型原始输出

    Returns:
        清洗后的内容，工具相关信息被移除
    """
    if not text or not isinstance(text, str):
        return text or ""

    result = text

    # 1. 过滤完整的工具调用描述句式
    result = _TOOL_PATTERN_RE.sub("", result)

    # 2. 过滤单独出现的工具名（前后有空格或标点）
    for name in _TOOL_NAMES:
        # 匹配 `tool_name` 或 "tool_name" 或 纯 tool_name
        result = re.sub(
            rf"[`\"']?{re.escape(name)}[`\"']?",
            "",
            result,
        )

    # 3. 清理多余空格和标点
    result = re.sub(r"\s{2,}", " ", result)
    result = re.sub(r"[，。]\s*[，。]", "。", result)
    result = result.strip()

    # 4. 如果清洗后为空，返回原内容（避免误杀导致空白）
    if not result.strip():
        return text.strip()

    return result

"""回答内容过滤：删除工具名和工具调用描述，防止泄露给前端。"""


def sanitize_response(text: str) -> str:
    """清洗回答内容，删除工具名和工具调用描述。

    Args:
        text: 模型原始输出

    Returns:
        清洗后的内容，工具相关信息被移除
    """
    if not text or not isinstance(text, str):
        return text or ""

    # 当前依赖系统提示词约束 + SSE 流中跳过 tool_calls 消息来隐藏工具信息
    # 后处理过滤暂不使用（正则复杂度高，容易误伤正常内容）
    # 注意：不要对逐 token 内容调用 strip()，否则会丢失换行符和缩进空白，
    # 导致前端 markdown 解析失败。
    return text

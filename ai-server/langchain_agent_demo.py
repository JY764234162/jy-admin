"""
LangChain Agent Demo - 测试 Agent 模型调用（支持线上图片 URL）

用法：
    1. 填写 IMAGE_URL（线上图片地址）
    2. 在 ai-server 目录下执行：uv run python langchain_agent_demo.py
"""

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage


# ========== 配置 ==========
API_KEY = "sk-8978d2c8a453406e8b2678091be19186"
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
MODEL = "qwen3-vl-plus"

IMAGE_URL = "https://gips0.baidu.com/it/u=1690853528,2506870245&fm=3028&app=3028&f=JPEG&fmt=auto?w=1024&h=1024"           # 线上图片地址，例如：https://example.com/image.jpg
QUESTION = "这张图片里有什么？请详细描述。"


# ========== Agent 工具 ==========
def calculator(expression: str) -> str:
    """计算数学表达式，例如：calculator(\"1 + 2 * 3\") => \"7\""""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"


def main():
    if not API_KEY or not BASE_URL or not MODEL:
        print("❌ 请先填写 API_KEY、BASE_URL 和 MODEL")
        return

    # 初始化模型
    llm = ChatOpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
        model=MODEL,
        temperature=0.7,
    )

    # 创建 ReAct Agent
    tools = [calculator]
    agent = create_agent(llm, tools)

    # 构造消息
    # ⚠️ 只有多模态模型（如 qwen-vl-max、glm-4v）才支持图片；纯文本模型请留空 IMAGE_URL
    if IMAGE_URL:
        content = [
            {"type": "text", "text": QUESTION},
            {"type": "image_url", "image_url": {"url": IMAGE_URL}},
        ]
        messages = [HumanMessage(content=content)]
    else:
        messages = [HumanMessage(content=QUESTION)]

    print(f"🤖 模型: {MODEL}")
    print(f"💬 问题: {QUESTION}")
    if IMAGE_URL:
        print(f"🖼️ 图片: {IMAGE_URL}")
    print("⏳ Agent 调用中...\n")

    # Agent 调用
    response = agent.invoke({"messages": messages})

    # 取最后一条消息作为最终回复
    final_message = response["messages"][-1]
    print("✅ Agent 回复：")
    print(final_message.content)


if __name__ == "__main__":
    main()

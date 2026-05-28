"""
LangChain Agent Demo - 测试 Agent 模型调用（支持线上图片 URL）

用法：
    1. 填写 IMAGE_URL（线上图片地址）
    2. 在 ai-server 目录下执行：uv run python langchain_agent_demo.py
"""

import asyncio
from pprint import pprint

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain.agents.middleware import before_model, before_agent
from langchain_core.messages import HumanMessage, AIMessageChunk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(
    title="AI Server", description="RAG 知识库问答 + AI 对话服务", version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str


@app.post("/api/chat")
async def chat(req: ChatRequest):
    response = StreamingResponse(
        chat_stream(req.question),
        media_type="text/event-stream",
    )
    return response


# ========== 配置 ==========
API_KEY = "sk-8978d2c8a453406e8b2678091be19186"
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
MODEL = "qwen3-vl-plus"

# IMAGE_URL = "https://gips0.baidu.com/it/u=1690853528,2506870245&fm=3028&app=3028&f=JPEG&fmt=auto?w=1024&h=1024"  # 线上图片地址，例如：https://example.com/image.jpg
# QUESTION = "这张图片里有什么？请详细描述。"

SYSTEM_PROMPT = "你是一个智能助手，你叫芳芳"


# ========== Agent 工具 ==========
def calculator(expression: str) -> str:
    """计算数学表达式，例如：calculator(\"1 + 2 * 3\") => \"7\" """
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"


# ========== 全局单例：模型和 Agent 只初始化一次 ==========
_llm = ChatOpenAI(
    api_key=API_KEY,
    base_url=BASE_URL,
    model=MODEL,
    temperature=0.7,
    streaming=True,
)


@before_model
def pre_model(state, runtime):
    """每次模型调用前"""
    pprint(f"  -> [state]\n{state}\n")
    pprint(f"  -> [runtime]\n{runtime}\n")

    msg_count = len(state.get("messages", []))
    # print(f"  -> [before_model] 第 {msg_count} 条消息")
    return None


_agent = create_agent(
    model=_llm, tools=[calculator], system_prompt=SYSTEM_PROMPT, middleware=[pre_model]
)


async def chat_stream(question: str):
    if not API_KEY or not BASE_URL or not MODEL:
        print("❌ 请先填写 API_KEY、BASE_URL 和 MODEL")
        return

    messages = [HumanMessage(content=question)]

    print(f"🤖 模型: {MODEL}")
    print(f"💬 问题: {question}")
    # if IMAGE_URL:
    #     print(f"🖼️ 图片: {IMAGE_URL}")
    print("⏳ Agent 调用中...\n")

    # Agent 调用
    for msg_chunk, meta_data in _agent.stream(
        {"messages": messages}, stream_mode="messages"
    ):
        # pprint(meta_data)
        if isinstance(msg_chunk, AIMessageChunk) and msg_chunk.content:
            yield f"data: {msg_chunk.content}\n\n"
    yield "data: [DONE]\n\n"
    print("⏳ Agent 回答已结束...\n")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("langchain_agent_demo:app", host="0.0.0.0", port=8001, reload=True)

"""
LangChain Agent Demo - 测试 Agent 模型调用（支持线上图片 URL）

用法：
    1. 填写 IMAGE_URL（线上图片地址）
    2. 在 ai-server 目录下执行：uv run python langchain_agent_demo.py
"""

import asyncio
import os
from pprint import pprint

from langchain.agents import create_agent
from langchain.agents.middleware import before_model, before_agent
from langchain_core.messages import HumanMessage, AIMessageChunk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# 加载 .env 文件（.env 在 ai-server 的父目录）
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# 独立项目区分
os.environ["LANGSMITH_PROJECT"] = "jy-admin-demo"

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


def run_server():
    import uvicorn

    uvicorn.run("langchain_agent_demo:app", host="0.0.0.0", port=8001, reload=True)


# ========== Agent 工具 ==========
def calculator(expression: str) -> str:
    """计算数学表达式，例如：calculator(\"1 + 2 * 3\") => \"7\" """
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"


# ========== 配置 ==========
API_KEY = os.getenv("AI_API_KEY")
BASE_URL = os.getenv("AI_BASE_URL")
MODEL = os.getenv("AI_MODEL")
QUESTION = "这张图片的内容是什么"
IMAGE_URL = "https://gips0.baidu.com/it/u=1690853528,2506870245&fm=3028&app=3028&f=JPEG&fmt=auto?w=1024&h=1024"  # 线上图片地址，例如：https://example.com/image.jpg


# ========== 全局单例：模型和 Agent 只初始化一次 ==========


@before_model
def pre_model(state, runtime):
    """每次模型调用前"""
    pprint(f"  -> [state]\n{state}\n")
    pprint(f"  -> [runtime]\n{runtime}\n")

    msg_count = len(state.get("messages", []))
    print(f"  -> [before_model] 第 {msg_count} 条消息")
    return None


_agent_instance = None


def get_agent():
    global _agent_instance
    if _agent_instance is not None:
        return _agent_instance

    _llm = ChatOpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
        model=MODEL,
        temperature=0.7, 
        streaming=True,
    )
    _agent_instance = create_agent(
        model=_llm,
        tools=[calculator],
        system_prompt="你是一个智能助手，你叫芳芳",
        middleware=[pre_model],
    )
    return _agent_instance


def chat_stream(question: str):
    agent = get_agent()
    if not agent:
        print("agent获取失败")
        return

    messages = [HumanMessage(content=QUESTION)]

    print(f"💬 问题: {QUESTION}")

    # Agent 调用
    for msg_chunk, meta_data in agent.stream(
        {"messages": messages}, stream_mode="messages"
    ):
        pprint(meta_data)
        if isinstance(msg_chunk, AIMessageChunk) and msg_chunk.content:
            yield f"data: {msg_chunk.content}\n\n"
    yield "data: [DONE]\n\n"
    print("⏳ Agent 回答已结束...\n")


def test_smith():
    agent = get_agent()
    if not agent:
        print("agent获取失败")
        return

    messages = [HumanMessage(content=[
        {"type": "text", "text": QUESTION},
        {"type": "image_url", "image_url": {"url": IMAGE_URL}}
    ])]

    result = agent.invoke({"messages": messages})

    print(result["messages"][-1].content)


if __name__ == "__main__":
    test_smith()

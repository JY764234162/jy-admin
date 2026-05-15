from typing import List

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

import config

# LangChain LLM 实例（OpenAI 兼容接口，指向 LongCat）
llm = ChatOpenAI(
    model=config.AI_MODEL,
    openai_api_key=config.AI_API_KEY,
    openai_api_base=config.AI_BASE_URL,
    streaming=True,
)

# GLM-4V 多模态实例（智谱 AI，OpenAI 兼容接口）
vision_llm = ChatOpenAI(
    model=config.GLM4V_MODEL,
    openai_api_key=config.GLM4V_API_KEY,
    openai_api_base=config.GLM4V_BASE_URL,
    streaming=True,
    temperature=0.7,
) if config.GLM4V_API_KEY else None


# ========== 基础对话接口 ==========


def chat(messages: list[dict], stream: bool = False):
    resp = llm.invoke(messages)
    return resp.content


def chat_stream(messages: list[dict]):
    return llm.stream(messages)


# ========== 结构化输出 ==========


class RAGAnswer(BaseModel):
    """RAG 知识库问答结构化输出"""

    answer: str = Field(description="根据参考资料生成的回答")
    sources: List[str] = Field(description="引用的来源文件列表")
    confidence: float = Field(
        description="回答置信度，范围 0.0~1.0", ge=0.0, le=1.0
    )


def get_structured_llm():
    """获取支持结构化输出的 LLM 实例（使用 with_structured_output）"""
    return llm.with_structured_output(RAGAnswer)

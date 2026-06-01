from typing import List

from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model
import config

# LangChain LLM 实例（OpenAI 兼容接口，指向 LongCat）
llm = init_chat_model(
    model=config.AI_MODEL,
    model_provider="openai",
    openai_api_key=config.AI_API_KEY,
    openai_api_base=config.AI_BASE_URL,
    streaming=True,
)

# 非流式 LLM 实例（专用于摘要生成，可独立配置以节省成本）
summary_llm = init_chat_model(
    model=config.SUMMARY_MODEL,
    model_provider="openai",
    openai_api_key=config.SUMMARY_API_KEY,
    openai_api_base=config.SUMMARY_BASE_URL,
    streaming=False,
)

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

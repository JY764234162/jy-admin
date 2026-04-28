from langchain_openai import ChatOpenAI
import config

llm = ChatOpenAI(
    model=config.AI_MODEL,
    openai_api_key=config.AI_API_KEY,
    openai_api_base=config.AI_BASE_URL,
    streaming=True,
)


def chat(messages: list[dict], stream: bool = False):
    resp = llm.invoke(messages)
    return resp.content


def chat_stream(messages: list[dict]):
    return llm.stream(messages)

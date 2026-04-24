from openai import OpenAI
import config

client = OpenAI(api_key=config.AI_API_KEY, base_url=config.AI_BASE_URL)


def chat(messages: list[dict], stream: bool = False):
    resp = client.chat.completions.create(
        model=config.AI_MODEL,
        messages=messages,
        stream=stream,
    )
    if stream:
        return resp
    return resp.choices[0].message.content


def chat_stream(messages: list[dict]):
    return client.chat.completions.create(
        model=config.AI_MODEL,
        messages=messages,
        stream=True,
    )

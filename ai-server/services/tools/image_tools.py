"""图片理解工具：使用 GLM-4V 多模态模型识别图片内容。"""

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool


@tool
def image_understand_tool(image_url: str) -> str:
    """理解图片内容。当用户提到图片、上传图片或询问图片相关问题时调用此工具。

    输入参数 image_url 是用户提供的图片链接地址，工具会使用 GLM-4V 多模态模型
    分析图片并返回详细的中文描述。

    使用场景：
    - 用户上传了图片并询问图片内容
    - 用户说"帮我看看这张图"、"这张图是什么"等
    - 用户提供了图片链接并要求分析

    Args:
        image_url: 图片的 URL 地址
    """
    from services.llm.llm import vision_llm

    if not vision_llm:
        return "图片识别服务未配置，请检查 GLM4V_API_KEY。"

    messages = [
        HumanMessage(content=[
            {
                "type": "text",
                "text": "请详细描述这张图片的内容，包括画面中的主要元素、文字、场景等信息。",
            },
            {
                "type": "image_url",
                "image_url": {"url": image_url},
            },
        ])
    ]
    response = vision_llm.invoke(messages)
    return response.content

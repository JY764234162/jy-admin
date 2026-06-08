"""Chat 后台 Graph 执行。"""

import asyncio
import traceback
from functools import partial

from services.agent_graph import patch_last_human_message
from services.streaming.graph_executor import run_graph_background
from services.streaming.stream_buffer import get_buffer

from .attachments_prep import prepare_memory_and_attachments
from .memory import semantic_memory
from .persistence import persist_chat_result


async def run_chat_background(
    *,
    thread_id: str,
    user_id: str,
    user_message: str,
    attachments_json: str,
    attachments_list: list,
    enable_knowledge: bool,
    enable_search: bool,
    conv_db_id: int | None,
    conversation_id,
) -> None:
    """记忆检索 → 补全 txt 附件 → Graph 生成 → 持久化元数据。"""
    full_response = ""
    error_msg = None

    try:
        memory_context, text_supplements = await asyncio.to_thread(
            prepare_memory_and_attachments,
            user_message,
            user_id,
            attachments_list,
        )

        if text_supplements:
            await patch_last_human_message(
                message=user_message,
                thread_id=thread_id,
                user_id=user_id,
                memory_context=memory_context,
                attachments_list=attachments_list,
                text_supplements=text_supplements,
                enable_knowledge=enable_knowledge,
                enable_search=enable_search,
            )

        full_response = await run_graph_background(
            thread_id=thread_id,
            user_id=user_id,
            memory_context=memory_context,
            enable_knowledge=enable_knowledge,
            enable_search=enable_search,
        )

        # TODO: 长期记忆暂时关闭，避免记忆污染（工具结果被当作事实保存）
        # if full_response.strip() and user_message.strip():
        #     await asyncio.to_thread(
        #         semantic_memory.save_interaction,
        #         user_message,
        #         full_response,
        #         str(conversation_id),
        #         str(user_id),
        #     )
    except asyncio.CancelledError:
        buf = get_buffer(thread_id)
        if buf:
            full_response = buf.full_text
        raise
    except Exception as e:
        error_msg = str(e) or repr(e) or type(e).__name__
        print(f"[chat] 后台 Graph 执行异常: {error_msg}", flush=True)
        traceback.print_exc()
        buf = get_buffer(thread_id)
        if buf:
            full_response = buf.full_text
    finally:
        if conv_db_id:
            status = "error" if error_msg else "success"
            last_display = (full_response or user_message)[:100]
            await asyncio.to_thread(
                partial(
                    persist_chat_result,
                    conv_db_id,
                    full_response,
                    status,
                    user_message,
                    attachments_json,
                    increment_count=True,
                    last_msg_override=last_display,
                )
            )

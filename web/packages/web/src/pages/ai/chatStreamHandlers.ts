import type { Dispatch, SetStateAction } from "react";
import type { AIConversation } from "@/api/aiApi";
import type { ChatSseHandlers } from "./chatSse";
import type { UiMessage } from "./types";

export interface CreateStreamHandlersParams {
  cid: number;
  aiMsgId: string;
  isCurrentStream: () => boolean;
  liveMessages: () => UiMessage[];
  setLoading: (loading: boolean) => void;
  setMessages: Dispatch<SetStateAction<UiMessage[]>>;
  setSessions: Dispatch<SetStateAction<AIConversation[]>>;
  onStreamEnd: () => void;
  onAfterMessagesChange?: () => void;
  notifyError: (err: string) => void;
}

/** 创建 SSE 流式回调，集中处理 AI 消息的增量 / 完成 / 错误 */
export function createChatStreamHandlers(
  params: CreateStreamHandlersParams
): ChatSseHandlers {
  const {
    cid,
    aiMsgId,
    isCurrentStream,
    liveMessages,
    setLoading,
    setMessages,
    setSessions,
    onStreamEnd,
    onAfterMessagesChange,
    notifyError,
  } = params;

  const updateAiMessage = (
    updater: (msg: UiMessage) => UiMessage
  ) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === aiMsgId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = updater(next[idx]!);
      return next;
    });
  };

  return {
    onContent: (content, isFull) => {
      if (!isCurrentStream()) return;
      updateAiMessage((msg) => ({
        ...msg,
        content: isFull ? content : msg.content + content,
      }));
    },

    onDone: () => {
      if (!isCurrentStream()) return;
      onStreamEnd();
      setLoading(false);
      updateAiMessage((msg) => ({ ...msg, status: "success" }));
      onAfterMessagesChange?.();

      const lastUserMsg = liveMessages().findLast((m) => m.role === "user");
      if (lastUserMsg) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.ID === cid);
          if (idx === -1) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx]!, lastMsg: lastUserMsg.content };
          return next;
        });
      }
    },

    onError: (err) => {
      if (!isCurrentStream()) return;
      onStreamEnd();
      setLoading(false);
      updateAiMessage((msg) => ({ ...msg, content: err, status: "error" }));
      onAfterMessagesChange?.();
      notifyError(err);
    },
  };
}

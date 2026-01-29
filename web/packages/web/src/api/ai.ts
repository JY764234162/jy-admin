import { fetchEventSource } from "@microsoft/fetch-event-source";
import request from "@/utils/request";
import type { ApiResponse, PageResult } from "./types";
import { localStg } from "@/utils/storage";

// AI 对话相关类型定义
export interface AIConversation {
  ID: number;
  userId: number;
  title: string;
  lastMsg: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AIMessage {
  ID: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationRequest {
  title: string;
}

export interface ChatMessageRequest {
  conversationId: number;
  content: string;
}

export interface ConversationListParams {
  page?: number;
  pageSize?: number;
}

export interface MessageListParams {
  page?: number;
  pageSize?: number;
}

/**
 * AI 对话 API
 */
export const aiApi = {
  /**
   * 创建会话
   */
  createConversation: (data: CreateConversationRequest): Promise<ApiResponse<AIConversation>> => {
    return request.post("/ai/conversation", data);
  },

  /**
   * 获取会话列表
   */
  getConversationList: (params?: ConversationListParams): Promise<ApiResponse<PageResult<AIConversation>>> => {
    return request.get("/ai/conversation/list", { params });
  },

  /**
   * 删除会话
   */
  deleteConversation: (id: number): Promise<ApiResponse> => {
    return request.delete(`/ai/conversation/${id}`);
  },

  /**
   * 获取会话消息列表（分页，时间倒序，默认最近10条）
   */
  getMessageList: (
    conversationId: number,
    params?: MessageListParams
  ): Promise<ApiResponse<PageResult<AIMessage>>> => {
    return request.get(`/ai/conversation/${conversationId}/messages`, { params });
  },

  /**
   * 发送消息（流式返回）
   * 使用 @microsoft/fetch-event-source 实现 SSE
   */
  chatMessage: async (
    data: ChatMessageRequest,
    onChunk: (chunk: string) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> => {
    const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
    const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
    const url = `${VITE_API_BASE_URL}${API_PREFIX}/ai/chat`;

    const token = localStg.get("token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const ctrl = new AbortController();
    let completed = false;
    const finish = () => {
      if (!completed) {
        completed = true;
        onComplete?.();
      }
    };

    try {
      await fetchEventSource(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        signal: ctrl.signal,

        async onopen(response: Response) {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ msg: "请求失败" }));
            throw new Error(errorData.msg || `HTTP error! status: ${response.status}`);
          }
        },

        onmessage(ev: { data: string }) {
          if (!ev.data) return;
          try {
            const parsed = JSON.parse(ev.data) as {
              content?: string;
              done?: boolean;
              error?: string;
            };

            if (parsed.error) {
              onError?.(new Error(parsed.error));
              ctrl.abort();
              return;
            }

            if (parsed.content !== undefined && parsed.content !== null) {
              onChunk(parsed.content);
            }

            if (parsed.done) {
              finish();
              ctrl.abort();
            }
          } catch (e) {
            console.error("解析 SSE 数据失败:", e, ev.data);
          }
        },

        onerror(err: unknown) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
          ctrl.abort();
        },

        onclose() {
          finish();
        },
      });
    } catch (error) {
      // AbortError 表示主动关闭，不当作错误
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  },
};

import { fetchEventSource } from "@microsoft/fetch-event-source";
import { localStg } from "@/utils/storage";

// AI Server 地址
const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || "";

/** 构造完整 URL（空 AI_SERVER_URL 时使用当前页面 origin） */
function aiUrl(path: string): URL {
  const base = AI_SERVER_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return new URL(path, base);
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = localStg.get("token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** AI Server 统一响应包装 */
interface AIServerResponse<T> {
  code: number;
  data: T;
  msg: string;
}

/** 解包响应 */
async function unwrap<T>(res: Response, fallbackMsg: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as AIServerResponse<T> | null;
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(body?.msg || fallbackMsg);
  }
  return body.data;
}

/** 包装为标准响应格式（不解包，供 aiApi 使用） */
async function wrapResponse<T>(res: Response): Promise<AIServerResponse<T>> {
  const body = (await res.json().catch(() => ({ code: -1, data: null as T, msg: "解析响应失败" }))) as AIServerResponse<T>;
  if (!res.ok && body.code === 0) {
    body.code = res.status;
    body.msg = `HTTP ${res.status}`;
  }
  return body;
}

// ========== 类型定义 ==========

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
  status?: string;
  attachments?: string;
  createdAt: string;
}

export interface CreateConversationRequest {
  title: string;
}

export interface UpdateConversationTitleRequest {
  title: string;
}

export interface ChatMessageRequest {
  conversationId: number;
  content: string;
  enable_knowledge?: boolean;
  enable_search?: boolean;
  attachments?: string;
}

export interface ConversationListParams {
  page?: number;
  pageSize?: number;
}

export interface MessageListParams {
  page?: number;
  pageSize?: number;
}

export interface ChatStreamHandle {
  abort: () => void;
}

/** 知识库文档 */
export interface KnowledgeDocument {
  doc_id: string;
  source: string;
  chunk_count: number;
  cos_url?: string;
  file_type?: string;
  created_at?: string;
  parse_at?: string;
  status?: string;
  error_msg?: string;
}

/** 知识库上传响应 */
export interface UploadKnowledgeResponse {
  knowledge_id: string;
  filename: string;
  chunks: number;
  cos_url?: string;
}

// ========== AI 对话 API ==========

export const aiApi = {
  /** 创建会话 */
  createConversation: (data: CreateConversationRequest): Promise<AIServerResponse<AIConversation>> => {
    return fetch(`${AI_SERVER_URL}/api/ai/conversation`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => wrapResponse(res));
  },

  /** 获取会话列表 */
  getConversationList: (params?: ConversationListParams): Promise<AIServerResponse<{ list: AIConversation[]; total: number; page: number; pageSize: number }>> => {
    const url = aiUrl("/api/ai/conversation/list");
    if (params?.page) url.searchParams.set("page", String(params.page));
    if (params?.pageSize) url.searchParams.set("page_size", String(params.pageSize));
    return fetch(url.toString(), { headers: getHeaders() }).then((res) => wrapResponse(res));
  },

  /** 删除会话 */
  deleteConversation: (id: number): Promise<AIServerResponse<unknown>> => {
    return fetch(`${AI_SERVER_URL}/api/ai/conversation/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    }).then((res) => wrapResponse(res));
  },

  /** 更新会话标题 */
  updateConversationTitle: (id: number, data: UpdateConversationTitleRequest): Promise<AIServerResponse<unknown>> => {
    return fetch(`${AI_SERVER_URL}/api/ai/conversation/${id}/title`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then((res) => wrapResponse(res));
  },

  /** 获取会话消息列表 */
  getMessageList: (conversationId: number, params?: MessageListParams): Promise<AIServerResponse<{ list: AIMessage[]; total: number; page: number; pageSize: number }>> => {
    const url = aiUrl(`/api/ai/conversation/${conversationId}/messages`);
    if (params?.page) url.searchParams.set("page", String(params.page));
    if (params?.pageSize) url.searchParams.set("page_size", String(params.pageSize));
    return fetch(url.toString(), { headers: getHeaders() }).then((res) => wrapResponse(res));
  },

  /** 发送消息（SSE 流式） */
  chatMessage: async (
    data: ChatMessageRequest,
    onChunk: (chunk: string) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<ChatStreamHandle> => {
    const url = `${AI_SERVER_URL}/api/ai/chat`;
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
        headers: getHeaders(),
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
      if (error instanceof Error && error.name === "AbortError") {
        return { abort: () => ctrl.abort() };
      }
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    return { abort: () => ctrl.abort() };
  },
};

// ========== 知识库 API ==========

export const aiServerApi = {
  /** 获取知识库文档列表 */
  getKnowledgeList: async (keyword?: string): Promise<{ documents: KnowledgeDocument[] }> => {
    const url = aiUrl("/api/ai/knowledge/list");
    if (keyword) url.searchParams.set("keyword", keyword);
    const res = await fetch(url.toString(), { headers: getHeaders() });
    return unwrap(res, "获取知识库列表失败");
  },

  /** 上传文档到知识库 */
  uploadKnowledge: async (file: File): Promise<UploadKnowledgeResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${AI_SERVER_URL}/api/ai/knowledge/upload`, {
      method: "POST",
      headers: { Authorization: getHeaders().Authorization || "" },
      body: formData,
    });
    return unwrap(res, "上传失败");
  },

  /** 删除知识库文档 */
  deleteKnowledge: async (docId: string): Promise<unknown> => {
    const res = await fetch(`${AI_SERVER_URL}/api/ai/knowledge/${docId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return unwrap(res, "删除失败");
  },

  /** 重试失败的文档解析 */
  retryKnowledge: async (docId: string): Promise<void> => {
    const res = await fetch(`${AI_SERVER_URL}/api/ai/knowledge/${docId}/retry`, {
      method: "POST",
      headers: getHeaders(),
    });
    return unwrap(res, "重试失败");
  },
};

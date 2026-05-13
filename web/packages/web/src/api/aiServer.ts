import { localStg } from "@/utils/storage";

const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const BASE_URL = `${VITE_API_BASE_URL}${API_PREFIX}`;

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = localStg.get("token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Go 后端统一响应包装,业务数据在 data 字段 */
interface BackendResponse<T> {
  code: number;
  data: T;
  msg: string;
}

/** 解包后端响应,失败时抛出 msg */
async function unwrap<T>(res: Response, fallbackMsg: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as BackendResponse<T> | null;
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(body?.msg || fallbackMsg);
  }
  return body.data;
}

/** 知识库文档 */
export interface KnowledgeDocument {
  doc_id: string;
  source: string;
  chunk_count: number;
  cos_url?: string;
  file_type?: string;
  created_at?: string;
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

/** 知识库问答结构化响应 */
export interface KnowledgeQueryResponse {
  answer: string;
  sources: string[];
  confidence: number;
}

/** AI Server API 客户端（通过 Go 后端代理） */
export const aiServerApi = {
  /** 获取知识库文档列表（代理） */
  getKnowledgeList: async (keyword?: string): Promise<{ documents: KnowledgeDocument[] }> => {
    const url = new URL(`${BASE_URL}/ai/knowledge/list`, window.location.origin);
    if (keyword) {
      url.searchParams.set("keyword", keyword);
    }
    const res = await fetch(url.toString(), {
      headers: getHeaders(),
    });
    return unwrap<{ documents: KnowledgeDocument[] }>(res, "获取知识库列表失败");
  },

  /** 上传文档到知识库（代理） */
  uploadKnowledge: async (file: File): Promise<UploadKnowledgeResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/ai/knowledge/upload`, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });
    return unwrap<UploadKnowledgeResponse>(res, "上传失败");
  },

  /** 删除知识库文档（代理） */
  deleteKnowledge: async (docId: string): Promise<unknown> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/${docId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return unwrap(res, "删除失败");
  },

  /** 知识库结构化查询（非流式，代理） */
  queryKnowledgeStructured: async (question: string, top_k = 3): Promise<KnowledgeQueryResponse> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/query`, {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ question, top_k, structured: true }),
    });
    return unwrap<KnowledgeQueryResponse>(res, "查询失败");
  },

  /** 重试失败的文档解析 */
  retryKnowledge: async (docId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/${docId}/retry`, {
      method: "POST",
      headers: getHeaders(),
    });
    return unwrap(res, "重试失败");
  },
};

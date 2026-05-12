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

/** 知识库文档 */
export interface KnowledgeDocument {
  doc_id: string;
  source: string;
  chunk_count: number;
  cos_url?: string;
  file_type?: string;
  created_at?: string;
}

/** 知识库上传响应 */
export interface UploadKnowledgeResponse {
  knowledge_id: string;
  filename: string;
  chunks: number;
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
  getKnowledgeList: async (): Promise<{ documents: KnowledgeDocument[] }> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/list`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("获取知识库列表失败");
    return res.json();
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "上传失败" }));
      throw new Error(data.detail || data.msg || "上传失败");
    }
    return res.json();
  },

  /** 删除知识库文档（代理） */
  deleteKnowledge: async (docId: string): Promise<{ message: string }> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/${docId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("删除失败");
    return res.json();
  },

  /** 知识库结构化查询（非流式，代理） */
  queryKnowledgeStructured: async (question: string, top_k = 3): Promise<KnowledgeQueryResponse> => {
    const res = await fetch(`${BASE_URL}/ai/knowledge/query`, {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ question, top_k, structured: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "查询失败" }));
      throw new Error(data.detail || data.msg || "查询失败");
    }
    return res.json();
  },
};

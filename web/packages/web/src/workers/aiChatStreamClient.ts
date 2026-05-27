import { localStg } from "@/utils/storage";

interface ThinkingProcess {
  plan: { status: "processing" | "successful" | "failed"; message: string };
  step: {
    status: "processing" | "successful" | "failed";
    processes: { step_id: string; status: "processing" | "successful" | "failed"; message: string; description: string }[];
    source: unknown[];
  };
  task_status: "processing" | "successful" | "failed";
}

type UpdateMsg = {
  type: "UPDATE";
  payload: {
    streamId: string;
    conversationId: number;
    delta: string;
    fullText: string;
    done: boolean;
    error?: string;
    thinkingProcess?: ThinkingProcess;
    thinkingStatus?: "processing" | "successful" | "failed";
    stepStatus?: string;
  };
};

type SnapshotMsg = {
  type: "SNAPSHOT";
  payload: {
    conversationId: number;
    fullText: string;
    status: "idle" | "streaming" | "done" | "error";
    updatedAt: number;
    thinkingProcess?: ThinkingProcess;
    thinkingStatus?: "processing" | "successful" | "failed";
    stepStatus?: string;
  };
};

type WorkerOut = UpdateMsg | SnapshotMsg;

export type AiChatStreamSnapshot = SnapshotMsg["payload"];


type Subscriber = (snapshot: AiChatStreamSnapshot) => void;

type StreamLifecycleListener = (snapshot: AiChatStreamSnapshot) => void;

let workerSingleton: Worker | null = null;
const subscribersByConversation = new Map<number, Set<Subscriber>>();
const latestSnapshotByConversation = new Map<number, AiChatStreamSnapshot>();
const streamLifecycleListeners = new Set<StreamLifecycleListener>();

function dispatchSnapshot(snap: AiChatStreamSnapshot) {
  latestSnapshotByConversation.set(snap.conversationId, snap);
  const subs = subscribersByConversation.get(snap.conversationId);
  subs?.forEach((fn) => fn(snap));
  streamLifecycleListeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      // ignore broken listeners
    }
  });
}

function ensureWorker() {
  if (workerSingleton) return workerSingleton;
  workerSingleton = new Worker(new URL("./aiChatStream.worker.ts", import.meta.url), { type: "module" });
  workerSingleton.onmessage = (evt: MessageEvent<WorkerOut>) => {
    const msg = evt.data;
    if (!msg) return;

    if (msg.type === "SNAPSHOT") {
      dispatchSnapshot(msg.payload);
      return;
    }

    if (msg.type === "UPDATE") {
      const snap: AiChatStreamSnapshot = {
        conversationId: msg.payload.conversationId,
        fullText: msg.payload.fullText,
        status: msg.payload.error ? "error" : msg.payload.done ? "done" : "streaming",
        updatedAt: Date.now(),
        thinkingProcess: msg.payload.thinkingProcess,
        thinkingStatus: msg.payload.thinkingStatus,
        stepStatus: msg.payload.stepStatus,
      };
      dispatchSnapshot(snap);
      return;
    }
  };
  return workerSingleton;
}

function buildChatUrl(resume = false) {
  const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || "";
  if (AI_SERVER_URL) {
    return `${AI_SERVER_URL}/api/ai/chat${resume ? "/resume" : ""}`;
  }
  // 通过 Nginx 代理（生产环境，与 Go 后端同域名）
  const base = `${import.meta.env.VITE_API_BASE_URL || ""}${import.meta.env.VITE_API_PREFIX || "/api"}`;
  return `${base}/ai/chat${resume ? "/resume" : ""}`;
}

function createStreamId() {
  return `stream_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const aiChatStreamClient = {
  /**
   * 订阅任意会话流式状态快照（含无 UI 订阅者时 worker 仍会持续产出）。
   * 用于按会话维度维护 loading 等状态，支持多会话并行流式。
   */
  subscribeStreamLifecycle(fn: StreamLifecycleListener) {
    streamLifecycleListeners.add(fn);
    return () => {
      streamLifecycleListeners.delete(fn);
    };
  },

  /** 订阅某个会话的最新拼接文本（返回 unsubscribe） */
  subscribe(conversationId: number, fn: Subscriber) {
    const set = subscribersByConversation.get(conversationId) || new Set<Subscriber>();
    set.add(fn);
    subscribersByConversation.set(conversationId, set);

    // 订阅时先推一次本地最新快照（如果有）
    const latest = latestSnapshotByConversation.get(conversationId);
    if (latest) {
      fn(latest);
    } else {
      // 向 worker 请求一次 snapshot
      ensureWorker().postMessage({ type: "SNAPSHOT", payload: { conversationId } });
    }

    return () => {
      const cur = subscribersByConversation.get(conversationId);
      cur?.delete(fn);
      if (cur && cur.size === 0) {
        subscribersByConversation.delete(conversationId);
      }
    };
  },

  /** 获取某会话最新快照（同步内存）；没有则返回 null */
  getLatestSnapshot(conversationId: number): AiChatStreamSnapshot | null {
    return latestSnapshotByConversation.get(conversationId) || null;
  },

  /** 启动流式聊天，enable_knowledge 控制是否查询知识库 */
  start(
    conversationId: number,
    options: {
      content: string;
      resume?: boolean;
      imageBase64?: string;
      docIds?: string[];
      attachments?: { uid: string; filename: string; url?: string }[];
      enable_knowledge?: boolean;
    }
  ) {
    const {
      content,
      resume = false,
      imageBase64,
      docIds,
      attachments,
      enable_knowledge = false,
    } = options;
    const streamId = createStreamId();
    const token = localStg.get("token");
    ensureWorker().postMessage({
      type: "START",
      payload: {
        streamId,
        url: buildChatUrl(resume),
        token,
        conversationId,
        content,
        resume,
        imageBase64,
        docIds,
        attachments,
        enable_knowledge,
      },
    });
    return streamId;
  },

  /** 兼容旧调用：启动 ai-server 基础对话流式聊天 */
  startAiServerChat(conversationId: number, content: string) {
    return this.start(conversationId, { content });
  },

  /** 兼容旧调用：启动 ai-server 知识库问答流式查询 */
  startAiServerKnowledge(conversationId: number, content: string, _top_k = 3) {
    return this.start(conversationId, { content, enable_knowledge: true });
  },

  /** 停止某个 stream */
  stop(streamId: string) {
    ensureWorker().postMessage({ type: "STOP", payload: { streamId } });
  },

  /** 中止指定会话在 Worker 内当前活跃的 SSE（AbortController），避免页面卸载后旧连接仍与 resume 叠双流 */
  stopConversation(conversationId: number) {
    ensureWorker().postMessage({ type: "STOP_CONVERSATION", payload: { conversationId } });
  },

  /** 中止 Worker 内全部活跃 fetch（离开 AI 模块等场景） */
  stopAllStreams() {
    if (!workerSingleton) return;
    workerSingleton.postMessage({ type: "STOP_ALL" });
  },

  /** 主动向 worker 拉一次 snapshot（异步通过 subscribe 回来） */
  requestSnapshot(conversationId: number) {
    ensureWorker().postMessage({ type: "SNAPSHOT", payload: { conversationId } });
  },
};


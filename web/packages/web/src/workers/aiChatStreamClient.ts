import { localStg } from "@/utils/storage";

type UpdateMsg = {
  type: "UPDATE";
  payload: {
    streamId: string;
    conversationId: number;
    delta: string;
    fullText: string;
    done: boolean;
    error?: string;
  };
};

type SnapshotMsg = {
  type: "SNAPSHOT";
  payload: {
    conversationId: number;
    fullText: string;
    status: "idle" | "streaming" | "done" | "error";
    updatedAt: number;
  };
};

type WorkerOut = UpdateMsg | SnapshotMsg;

type Snapshot = SnapshotMsg["payload"];

type Subscriber = (snapshot: Snapshot) => void;

let workerSingleton: Worker | null = null;
const subscribersByConversation = new Map<number, Set<Subscriber>>();
const latestSnapshotByConversation = new Map<number, Snapshot>();

function ensureWorker() {
  if (workerSingleton) return workerSingleton;
  workerSingleton = new Worker(new URL("./aiChatStream.worker.ts", import.meta.url), { type: "module" });
  workerSingleton.onmessage = (evt: MessageEvent<WorkerOut>) => {
    const msg = evt.data;
    if (!msg) return;

    if (msg.type === "SNAPSHOT") {
      latestSnapshotByConversation.set(msg.payload.conversationId, msg.payload);
      const subs = subscribersByConversation.get(msg.payload.conversationId);
      subs?.forEach((fn) => fn(msg.payload));
      return;
    }

    if (msg.type === "UPDATE") {
      const snap: Snapshot = {
        conversationId: msg.payload.conversationId,
        fullText: msg.payload.fullText,
        status: msg.payload.error ? "error" : msg.payload.done ? "done" : "streaming",
        updatedAt: Date.now(),
      };
      latestSnapshotByConversation.set(msg.payload.conversationId, snap);
      const subs = subscribersByConversation.get(msg.payload.conversationId);
      subs?.forEach((fn) => fn(snap));
      return;
    }
  };
  return workerSingleton;
}

function buildChatUrl() {
  const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
  const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
  return `${VITE_API_BASE_URL}${API_PREFIX}/ai/chat`;
}

function createStreamId() {
  return `stream_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const aiChatStreamClient = {
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
  getLatestSnapshot(conversationId: number): Snapshot | null {
    return latestSnapshotByConversation.get(conversationId) || null;
  },

  /** 启动流式聊天，统一走 Go 后端，通过 mode 区分目标服务 */
  start(conversationId: number, content: string, mode: "backend" | "aiserver_chat" | "aiserver_knowledge" = "backend") {
    const streamId = createStreamId();
    const token = localStg.get("token");
    ensureWorker().postMessage({
      type: "START",
      payload: {
        streamId,
        url: buildChatUrl(),
        token,
        conversationId,
        content,
        mode,
      },
    });
    return streamId;
  },

  /** 兼容旧调用：启动 ai-server 基础对话流式聊天 */
  startAiServerChat(conversationId: number, content: string) {
    return this.start(conversationId, content, "aiserver_chat");
  },

  /** 兼容旧调用：启动 ai-server 知识库问答流式查询 */
  startAiServerKnowledge(conversationId: number, content: string, _top_k = 3) {
    return this.start(conversationId, content, "aiserver_knowledge");
  },

  /** 停止某个 stream */
  stop(streamId: string) {
    ensureWorker().postMessage({ type: "STOP", payload: { streamId } });
  },

  /** 主动向 worker 拉一次 snapshot（异步通过 subscribe 回来） */
  requestSnapshot(conversationId: number) {
    ensureWorker().postMessage({ type: "SNAPSHOT", payload: { conversationId } });
  },
};


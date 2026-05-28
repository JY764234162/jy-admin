// WebWorker: 负责 SSE 拉流、解析、拼接，并在页面切换后持续运行
// 注意：该文件会被 Vite 以 module worker 方式打包

type StartPayload = {
  streamId: string;
  url: string;
  token?: string | null;
  conversationId: number;
  content: string;
  /** 是否启用知识库工具（勾选知识库时传 true） */
  enable_knowledge?: boolean;
  /** 知识库问答配置 */
  knowledgeConfig?: { top_k?: number };
  /** 是否为恢复模式（刷新后重连，不重复保存用户消息） */
  resume?: boolean;
  /** 多模态图片 base64 */
  imageBase64?: string;
  /** 用户消息携带的附件元数据 */
  attachments?: { uid: string; filename: string; url?: string }[];
};

type StopPayload = {
  streamId: string;
};

type SnapshotPayload = {
  conversationId: number;
};

type StopConversationPayload = {
  conversationId: number;
};

type WorkerInMessage =
  | { type: "START"; payload: StartPayload }
  | { type: "STOP"; payload: StopPayload }
  | { type: "STOP_CONVERSATION"; payload: StopConversationPayload }
  | { type: "STOP_ALL"; payload?: Record<string, never> }
  | { type: "SNAPSHOT"; payload: SnapshotPayload };

type WorkerOutMessage =
  | {
      type: "UPDATE";
      payload: {
        streamId: string;
        conversationId: number;
        delta: string;
        fullText: string;
        done: boolean;
        error?: string;
      };
    }
  | {
      type: "SNAPSHOT";
      payload: {
        conversationId: number;
        fullText: string;
        status: "idle" | "streaming" | "done" | "error";
        updatedAt: number;
      };
    };

type ConversationState = {
  fullText: string;
  status: "idle" | "streaming" | "done" | "error";
  updatedAt: number;
  activeStreamId?: string;
};

const conversationState = new Map<number, ConversationState>();
const controllers = new Map<string, AbortController>();

function post(msg: WorkerOutMessage) {
  (self as unknown as Worker).postMessage(msg);
}

function getOrInitConv(conversationId: number): ConversationState {
  const existing = conversationState.get(conversationId);
  if (existing) return existing;
  const init: ConversationState = { fullText: "", status: "idle", updatedAt: Date.now() };
  conversationState.set(conversationId, init);
  return init;
}

function updateConv(conversationId: number, patch: Partial<ConversationState>) {
  const conv = getOrInitConv(conversationId);
  const next: ConversationState = { ...conv, ...patch, updatedAt: Date.now() };
  conversationState.set(conversationId, next);
  post({
    type: "SNAPSHOT",
    payload: {
      conversationId,
      fullText: next.fullText,
      status: next.status,
      updatedAt: next.updatedAt,
    },
  });
}

function emitUpdate(
  streamId: string,
  conversationId: number,
  delta: string,
  fullText: string,
  done: boolean,
  error?: string
) {
  post({
    type: "UPDATE",
    payload: { streamId, conversationId, delta, fullText, done, error },
  });
}

function stopStream(streamId: string) {
  const ctrl = controllers.get(streamId);
  if (ctrl) {
    ctrl.abort();
    controllers.delete(streamId);
  }
}

/** 中止指定会话当前活跃的 fetch（例如页面卸载、不再需要该路 SSE） */
function stopConversationStream(conversationId: number) {
  const conv = conversationState.get(conversationId);
  if (conv?.activeStreamId) {
    stopStream(conv.activeStreamId);
  }
}

function stopAllStreams() {
  const ids = [...controllers.keys()];
  for (const streamId of ids) {
    stopStream(streamId);
  }
}

async function startStream(p: StartPayload) {
  // 同一个会话只允许一个活跃 stream：启动新 stream 前，停掉旧的
  const conv = getOrInitConv(p.conversationId);
  if (conv.activeStreamId && conv.activeStreamId !== p.streamId) {
    stopStream(conv.activeStreamId);
  }

  const ctrl = new AbortController();
  controllers.set(p.streamId, ctrl);
  // 新一轮生成：重置本轮拼接文本
  updateConv(p.conversationId, { status: "streaming", activeStreamId: p.streamId, fullText: "" });

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (p.token) {
      headers.Authorization = `Bearer ${p.token}`;
    }

    // resume 模式走 /ai/chat/resume，仅传 conversationId；正常聊天走 /ai/chat
    const body: Record<string, unknown> = p.resume
      ? { conversationId: p.conversationId }
      : {
          conversationId: p.conversationId,
          message: p.content,
          image_url: p.imageBase64 ?? "",
          enable_knowledge: p.enable_knowledge ?? false,
          attachments: p.attachments ? JSON.stringify(p.attachments) : undefined,
        };

    const resp = await fetch(p.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      const errMsg = text || `HTTP ${resp.status}`;
      updateConv(p.conversationId, { status: "error" });
      emitUpdate(p.streamId, p.conversationId, "", getOrInitConv(p.conversationId).fullText, true, errMsg);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    // SSE 按 \n\n 分隔 event；我们只需要解析 data: 行
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 处理尽可能多的完整事件（以空行分隔）
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const lines = rawEvent.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.replace(/^data:\s?/, "");
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              done?: boolean;
              error?: string;
            };
            if (parsed.error) {
              const errText = parsed.error;
              updateConv(p.conversationId, { status: "error", fullText: errText });
              emitUpdate(p.streamId, p.conversationId, "", errText, true, errText);
              stopStream(p.streamId);
              return;
            }

            const delta = parsed.content ?? "";
            if (delta) {
              const cur = getOrInitConv(p.conversationId);
              const nextFull = cur.fullText + delta;
              conversationState.set(p.conversationId, {
                ...cur,
                fullText: nextFull,
                updatedAt: Date.now(),
                status: "streaming",
                activeStreamId: p.streamId,
              });
              emitUpdate(p.streamId, p.conversationId, delta, nextFull, false);
            }

            if (parsed.done) {
              const finalConv = getOrInitConv(p.conversationId);
              updateConv(p.conversationId, {
                status: "done",
                activeStreamId: undefined,
              });
              emitUpdate(p.streamId, p.conversationId, "", finalConv.fullText, true);
              stopStream(p.streamId);
              return;
            }
          } catch (e) {
            // 忽略单条解析错误，继续
            continue;
          }
        }
      }
    }

    // 流自然结束（没收到 done），也标记 done
    updateConv(p.conversationId, { status: "done", activeStreamId: undefined });
    emitUpdate(p.streamId, p.conversationId, "", getOrInitConv(p.conversationId).fullText, true);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      // 被主动停止：保持内容不变，状态回 idle（更符合"暂停"语义）
      updateConv(p.conversationId, { status: "idle", activeStreamId: undefined });
      return;
    }
    updateConv(p.conversationId, { status: "error", activeStreamId: undefined });
    emitUpdate(p.streamId, p.conversationId, "", getOrInitConv(p.conversationId).fullText, true, String(e?.message || e));
  } finally {
    controllers.delete(p.streamId);
  }
}

self.onmessage = (evt: MessageEvent<WorkerInMessage>) => {
  const msg = evt.data;
  if (!msg || !("type" in msg)) return;

  if (msg.type === "START") {
    void startStream(msg.payload);
    return;
  }
  if (msg.type === "STOP") {
    stopStream(msg.payload.streamId);
    return;
  }
  if (msg.type === "STOP_CONVERSATION") {
    stopConversationStream(msg.payload.conversationId);
    return;
  }
  if (msg.type === "STOP_ALL") {
    stopAllStreams();
    return;
  }
  if (msg.type === "SNAPSHOT") {
    const conv = getOrInitConv(msg.payload.conversationId);
    post({
      type: "SNAPSHOT",
      payload: {
        conversationId: msg.payload.conversationId,
        fullText: conv.fullText,
        status: conv.status,
        updatedAt: conv.updatedAt,
      },
    });
    return;
  }
};

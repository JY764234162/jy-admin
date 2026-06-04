import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { message as antdMessage } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/aiApi";
import { localStg } from "@/utils/storage";
import { conversationTitleFromFirstMessage } from "./conversationTitle";
import { normalizeMessageContent } from "./messageContent";
import type { UiMessage, SendOptions } from "./types";

export type { UiMessage, SendOptions } from "./types";

interface UseAIChatOptions {
  pageSize?: number;
  onAfterMessagesChange?: () => void;
}

/**
 * AI 对话数据层（路由级会话）
 *
 * - `conversationId` 来自 URL（由页面传入），切换会话 = 路由变化，本 hook 只保留**当前会话**的 messages / 分页。
 * - 会话列表 `sessions` 仍在此维护，供侧栏展示；当前选中项由 URL 决定，不再使用 activeKey state。
 * - `live`：把「异步里要读的最新 state」与「流式可变标记」收拢到一处，避免多个 mirror ref + 多段 `useEffect` 同步。
 * - `optionsRef`：避免调用方每次 render 传入新 `options` 对象导致 `useCallback` 抖动。
 * - `loadingMoreRef`：分页加载互斥，用 ref 不触发多余渲染。
 * - 无 URL 会话时：点「新对话」只进草稿页；首条发送时再 `createConversation`（标题取首问），避免空会话。
 * - **流式 loading 按会话隔离**：`loading` 仅表示「当前 URL 会话是否在流式生成」；其它会话可在后台并行，互不阻塞发送。
 */
export function useAIChat(conversationId: number | null, options: UseAIChatOptions = {}) {
  const PAGE_SIZE = options.pageSize ?? 10;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const navigate = useNavigate();
  const location = useLocation();

  const [sessions, setSessions] = useState<AIConversation[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagePagination, setMessagePagination] = useState<{ page: number; total: number } | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [loadingSessions, setLoadingSessions] = useState(false);

  /** 当前活跃的 SSE AbortController（null 表示没有活跃流式） */
  const sseAbortControllerRef = useRef<AbortController | null>(null);
  /** 与 sseAbortControllerRef 绑定的会话 id */
  const streamingConversationIdRef = useRef<number | null>(null);

  /** loading 表示当前 URL 会话是否正在接收 SSE */
  const [loading, setLoading] = useState(false);

  /** 并发保护：加载更多历史时避免重复请求 */
  const loadingMoreRef = useRef(false);
  /** 首条消息创建会话后，首屏消息列表为空时不覆盖本地乐观消息 */
  const suppressEmptyHydrateRef = useRef<number | null>(null);

  /**
   * 异步回调里读「最新」路由/列表/消息，以及流式过程中的可变标记。
   * 每轮 render 只同步 conversationId / sessions / messages 三块 state，其余字段由逻辑自行改写。
   */
  const live = useRef({
    conversationId: null as number | null,
    sessions: [] as AIConversation[],
    messages: [] as UiMessage[],
    streamingAiMsgId: null as string | null,
    streamingConversationId: null as number | null,
    refreshSessionsAfterStream: false,
  });
  live.current.conversationId = conversationId;
  live.current.sessions = sessions;
  live.current.messages = messages;

  const toDisplayOrder = useCallback((list: AIMessage[]): UiMessage[] => {
    const ordered = [...list].reverse();
    return ordered.map((msg) => {
      let parsedAttachments: UiMessage["attachments"];
      if (msg.attachments) {
        try {
          parsedAttachments = JSON.parse(msg.attachments) as UiMessage["attachments"];
        } catch {
          parsedAttachments = undefined;
        }
      }
      const status: UiMessage["status"] =
        msg.status === "error" ? "error" : msg.status === "loading" ? "loading" : "success";
      return {
        id: `msg-${msg.ID}`,
        content: normalizeMessageContent(msg.content),
        role: msg.role === "user" ? "user" : "ai",
        status,
        timestamp: new Date(msg.createdAt).getTime(),
        attachments: parsedAttachments,
      };
    });
  }, []);

  const navigateToConversation = useCallback(
    (id: number, replace = false) => {
      const sp = new URLSearchParams(location.search);
      sp.set("conversationId", String(id));
      navigate({ pathname: location.pathname, search: sp.toString() }, { replace });
    },
    [navigate, location.pathname, location.search]
  );

  // ========== SSE 辅助 ==========

  function buildChatUrl(resume = false) {
    const AI_SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || "";
    if (AI_SERVER_URL) {
      return `${AI_SERVER_URL}/api/ai/chat${resume ? "/resume" : ""}`;
    }
    const base = `${import.meta.env.VITE_API_BASE_URL || ""}${import.meta.env.VITE_API_PREFIX || "/api"}`;
    return `${base}/ai/chat${resume ? "/resume" : ""}`;
  }

  async function readSSE(
    url: string,
    body: Record<string, unknown>,
    onContent: (content: string, isFull: boolean) => void,
    onDone: () => void,
    onError: (err: string) => void,
    signal: AbortSignal
  ) {
    const token = localStg.get("token");
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        onError(text || `HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

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
                isFull?: boolean;
                done?: boolean;
                error?: string;
              };
              if (parsed.error) {
                onError(parsed.error);
                return;
              }
              if (parsed.content != null) {
                onContent(parsed.content, !!parsed.isFull);
              }
              if (parsed.done) {
                onDone();
                return;
              }
            } catch {
              continue;
            }
          }
        }
      }

      onDone();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      onError(String(e?.message || e));
    }
  }

  const abortActiveSSE = useCallback(() => {
    sseAbortControllerRef.current?.abort();
    sseAbortControllerRef.current = null;
    streamingConversationIdRef.current = null;
    live.current.streamingConversationId = null;
    live.current.streamingAiMsgId = null;
    setLoading(false);
  }, []);

  /** 直接建立 SSE 连接并驱动 UI 更新 */
  const startSSEStream = useCallback(
    (
      cid: number,
      aiMsgId: string,
      url: string,
      body: Record<string, unknown>
    ) => {
      const ctrl = new AbortController();
      sseAbortControllerRef.current = ctrl;
      streamingConversationIdRef.current = cid;
      live.current.streamingConversationId = cid;
      live.current.streamingAiMsgId = aiMsgId;
      setLoading(true);
      live.current.refreshSessionsAfterStream = true;

      const isCurrentStream = () =>
        live.current.conversationId === cid && streamingConversationIdRef.current === cid;

      readSSE(
        url,
        body,
        (content, isFull) => {
          if (!isCurrentStream()) return;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMsgId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = {
              ...next[idx]!,
              content: isFull ? content : next[idx]!.content + content,
            };
            return next;
          });
        },
        () => {
          if (!isCurrentStream()) return;
          sseAbortControllerRef.current = null;
          streamingConversationIdRef.current = null;
          live.current.streamingConversationId = null;
          live.current.streamingAiMsgId = null;
          setLoading(false);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMsgId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx]!, status: "success" };
            return next;
          });
          optionsRef.current.onAfterMessagesChange?.();
          // 更新侧边栏 lastMsg
          const lastUserMsg = live.current.messages.findLast((m) => m.role === "user");
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
        (err) => {
          if (!isCurrentStream()) return;
          sseAbortControllerRef.current = null;
          streamingConversationIdRef.current = null;
          live.current.streamingConversationId = null;
          live.current.streamingAiMsgId = null;
          setLoading(false);
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMsgId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx]!, content: err, status: "error" };
            return next;
          });
          optionsRef.current.onAfterMessagesChange?.();
          antdMessage.error(err);
        },
        ctrl.signal
      );
    },
    []
  );

  /** 接口 list[0] 为最新一条；展示列表经 toDisplayOrder reverse 后最新在末尾 */
  const tryResumeIfNeeded = useCallback(
    (cid: number, apiRows: AIMessage[], displayList: UiMessage[]) => {
      if (sseAbortControllerRef.current) return;
      if (apiRows.length === 0) return;

      const apiNewest = apiRows[0]!;
      const session = live.current.sessions.find((s) => s.ID === cid);
      const convStillLoading = session?.latestStatus === "loading";
      const apiIsAssistant = apiNewest.role === "assistant";

      const shouldResume =
        (apiIsAssistant && apiNewest.status === "loading") ||
        (convStillLoading && apiIsAssistant) ||
        (convStillLoading && apiNewest.role === "user");

      if (!shouldResume) return;

      const mappedId = `msg-${apiNewest.ID}`;
      let aiMsg =
        displayList.find((m) => m.id === mappedId && m.role === "ai") ??
        displayList.find((m) => m.role === "ai" && m.status === "loading") ??
        null;

      if (!aiMsg) {
        const aiMsgId = `ai-resume-${Date.now()}`;
        aiMsg = {
          id: aiMsgId,
          content: "",
          role: "ai",
          status: "loading",
          timestamp: Date.now(),
        };
        live.current.streamingAiMsgId = aiMsgId;
        setMessages((prev) => [...prev, aiMsg!]);
      } else {
        live.current.streamingAiMsgId = aiMsg.id;
      }

      startSSEStream(cid, aiMsg.id, buildChatUrl(true), {
        conversationId: cid,
        enable_knowledge: false,
        enable_search: false,
      });
    },
    [startSSEStream]
  );

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await aiApi.getConversationList({ page: 1, pageSize: 100 });
      if (res.code === 0 && res.data) {
        const sessionList = res.data.list || [];
        setSessions(sessionList);
      }
    } catch (error) {
      console.error("加载会话列表失败:", error);
      antdMessage.error("加载会话列表失败");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMessagesFirstPage = useCallback(
    async (cid: number) => {
      setMessagesLoading(true);
      try {
        const res = await aiApi.getMessageList(cid, { page: 1, pageSize: PAGE_SIZE });
        if (live.current.conversationId !== cid) return;

        if (res.code === 0 && res.data) {
          const { list = [], total = 0 } = res.data;
          const rows = (list || []) as AIMessage[];

          if (rows.length === 0 && suppressEmptyHydrateRef.current === cid) {
            suppressEmptyHydrateRef.current = null;
            setMessagePagination({ page: 1, total: 0 });
            optionsRef.current.onAfterMessagesChange?.();
          } else {
            const messageList = toDisplayOrder(rows);
            setMessages(messageList);
            setMessagePagination({ page: 1, total });
            optionsRef.current.onAfterMessagesChange?.();

            setTimeout(() => {
              tryResumeIfNeeded(cid, rows, messageList);
            }, 0);
          }
        } else {
          antdMessage.error(res.msg || "加载消息失败");
          setMessages([]);
          setMessagePagination({ page: 0, total: 0 });
        }
      } catch (error) {
        console.error("加载消息失败:", error);
        antdMessage.error("加载消息失败");
        if (live.current.conversationId === cid) {
          setMessages([]);
          setMessagePagination({ page: 0, total: 0 });
        }
      } finally {
        if (live.current.conversationId === cid) {
          setMessagesLoading(false);
        }
      }
    },
    [PAGE_SIZE, toDisplayOrder, tryResumeIfNeeded]
  );

  const loadMoreHistory = useCallback(async () => {
    if (conversationId == null || !Number.isFinite(conversationId)) return;
    if (!messagePagination || loadingMoreRef.current) return;
    const { page, total } = messagePagination;
    if (page * PAGE_SIZE >= total) return;

    loadingMoreRef.current = true;
    const nextPage = page + 1;
    const cid = conversationId;
    try {
      const res = await aiApi.getMessageList(cid, { page: nextPage, pageSize: PAGE_SIZE });
      if (live.current.conversationId !== cid) return;
      if (res.code === 0 && res.data) {
        const { list = [] } = res.data;
        const olderMessages = toDisplayOrder((list || []) as AIMessage[]);
        setMessages((prev) => [...olderMessages, ...prev]);
        setMessagePagination({ page: nextPage, total });
      }
    } catch (error) {
      console.error("加载更多消息失败:", error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [conversationId, messagePagination, PAGE_SIZE, toDisplayOrder]);

  const openNewDraft = useCallback(() => {
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
  }, [navigate, location.pathname]);

  const deleteSession = useCallback(
    async (key: string) => {
      const conversationIdToDelete = parseInt(key, 10);
      if (isNaN(conversationIdToDelete)) return;

      try {
        const res = await aiApi.deleteConversation(conversationIdToDelete);
        if (res.code === 0) {
          const wasCurrent = live.current.conversationId === conversationIdToDelete;
          const remainingAfter = live.current.sessions.filter((s) => s.ID !== conversationIdToDelete);
          setSessions(remainingAfter);

          if (wasCurrent) {
            if (remainingAfter.length > 0) {
              navigateToConversation(remainingAfter[0]!.ID, true);
            } else {
              navigate({ pathname: location.pathname, search: "" }, { replace: true });
            }
          }

          antdMessage.success("删除成功");
        } else {
          antdMessage.error(res.msg || "删除失败");
        }
      } catch (error) {
        console.error("删除会话失败:", error);
        antdMessage.error("删除会话失败");
      }
    },
    [navigate, location.pathname, navigateToConversation]
  );

  const renameSession = useCallback(
    async (key: string, newTitle: string) => {
      const cid = parseInt(key, 10);
      if (isNaN(cid)) {
        antdMessage.error("会话ID无效");
        return false;
      }
      const trimmed = newTitle.trim();
      if (!trimmed) {
        antdMessage.error("标题不能为空");
        return false;
      }
      try {
        const res = await aiApi.updateConversationTitle(cid, { title: trimmed });
        if (res.code === 0) {
          antdMessage.success("更新成功");
          await loadSessions();
          return true;
        }
        antdMessage.error(res.msg || "更新失败");
        return false;
      } catch (error) {
        console.error("重命名会话失败:", error);
        antdMessage.error("重命名会话失败");
        return false;
      }
    },
    [loadSessions]
  );

  const sendMessage = useCallback(
    async (options: SendOptions): Promise<boolean> => {
      const {
        content: userContent,
        useKnowledge,
        useSearch,
        targetConversationId,
        resume,
        attachments,
      } = options;

      if (!userContent.trim() && !resume) {
        return false;
      }

      let cid = targetConversationId ?? conversationId;

      if ((cid == null || !Number.isFinite(cid)) && !resume) {
        const trimmed = userContent.trim();
        const title = conversationTitleFromFirstMessage(trimmed);
        try {
          const res = await aiApi.createConversation({ title });
          if (res.code !== 0 || !res.data) {
            antdMessage.error(res.msg || "创建会话失败");
            return false;
          }
          const newSession = res.data;
          setSessions((prev) => [newSession, ...prev]);
          cid = newSession.ID;
          suppressEmptyHydrateRef.current = cid;
          navigateToConversation(cid, true);
        } catch (error) {
          console.error("创建会话失败:", error);
          antdMessage.error("创建会话失败");
          return false;
        }
      }

      if (cid == null || !Number.isFinite(cid)) {
        antdMessage.error("会话ID无效");
        return false;
      }

      if (
        sseAbortControllerRef.current &&
        streamingConversationIdRef.current === cid
      ) {
        antdMessage.warning("该会话正在回复中，请稍后再试");
        return false;
      }

      const content = userContent.trim();

      if (resume) {
        const loadingMsg = live.current.messages.find((m) => m.role === "ai" && m.status === "loading");
        if (!loadingMsg) {
          antdMessage.error("没有可恢复的 AI 消息");
          return false;
        }
        startSSEStream(cid, loadingMsg.id, buildChatUrl(true), {
          conversationId: cid,
          enable_knowledge: !!useKnowledge,
          enable_search: false,
        });
        return true;
      }

      const userMsg: UiMessage = {
        id: `user-${Date.now()}`,
        content,
        role: "user",
        status: "success",
        timestamp: Date.now(),
        attachments,
      };

      const aiMsgId = `ai-${Date.now()}`;
      live.current.streamingAiMsgId = aiMsgId;
      const initialAiMsg: UiMessage = {
        id: aiMsgId,
        content: "",
        role: "ai",
        status: "loading",
        timestamp: Date.now(),
      };

      setMessages((prev) => {
        const withoutLoading = prev.filter((m) => !(m.role === "ai" && m.status === "loading"));
        return [...withoutLoading, userMsg, initialAiMsg];
      });
      optionsRef.current.onAfterMessagesChange?.();

      startSSEStream(cid, aiMsgId, buildChatUrl(false), {
        conversationId: cid,
        message: content,
        attachments: attachments ? JSON.stringify(attachments) : undefined,
        enable_knowledge: !!useKnowledge,
        enable_search: !!useSearch,
      });
      return true;
    },
    [conversationId, startSSEStream, navigateToConversation]
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  /** 离开 AI 页时取消当前 SSE */
  useEffect(() => {
    return () => abortActiveSSE();
  }, [abortActiveSSE]);

  // 切换会话时在下一次绘制前清空旧消息；从草稿首次落盘到某会话时不清理（由首条 sendMessage 写入）
  useLayoutEffect(() => {
    abortActiveSSE();

    if (conversationId == null || !Number.isFinite(conversationId)) {
      suppressEmptyHydrateRef.current = null;
      setMessages([]);
      setMessagePagination(null);
      setMessagesLoading(false);
      return;
    }
    if (suppressEmptyHydrateRef.current === conversationId) {
      // 不要在这里清空 suppressEmptyHydrateRef！
      // 留给 loadMessagesFirstPage 去判断，避免后端返回数据时覆盖本地乐观消息
      setMessagePagination(null);
      setMessagesLoading(true);
      return;
    }
    setMessages([]);
    setMessagePagination(null);
    setMessagesLoading(true);
  }, [conversationId, abortActiveSSE]);

  useEffect(() => {
    if (conversationId == null || !Number.isFinite(conversationId)) return;
    void loadMessagesFirstPage(conversationId);
  }, [conversationId, loadMessagesFirstPage]);

  return {
    PAGE_SIZE,
    sessions,
    conversationId,
    navigateToConversation,
    messages,
    messagesLoading,
    loading,
    loadingSessions,
    messagePagination,
    loadSessions,
    loadMessagesFirstPage,
    loadMoreHistory,
    openNewDraft,
    deleteSession,
    renameSession,
    sendMessage,
  };
}

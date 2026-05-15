import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { message as antdMessage } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/ai";
import { aiChatStreamClient } from "@/workers/aiChatStreamClient";
import { conversationTitleFromFirstMessage } from "./conversationTitle";
import type { ChatMode, UiMessage } from "./types";

export type { ChatMode, UiMessage } from "./types";

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

  /** 正在流式生成中的会话 id（可多会话并行）；配合 tick 驱动当前会话 loading 重算 */
  const streamingConversationIdsRef = useRef(new Set<number>());
  const [streamingTick, setStreamingTick] = useState(0);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const markConversationStreaming = useCallback((cid: number) => {
    const set = streamingConversationIdsRef.current;
    if (!set.has(cid)) {
      set.add(cid);
      setStreamingTick((n) => n + 1);
    }
  }, []);

  const markConversationStreamEnded = useCallback((cid: number) => {
    if (streamingConversationIdsRef.current.delete(cid)) {
      setStreamingTick((n) => n + 1);
    }
  }, []);

  const loading = useMemo(() => {
    if (conversationId == null || !Number.isFinite(conversationId)) return false;
    return streamingConversationIdsRef.current.has(conversationId);
  }, [conversationId, streamingTick]);

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
    refreshSessionsAfterStream: false,
  });
  live.current.conversationId = conversationId;
  live.current.sessions = sessions;
  live.current.messages = messages;

  const toDisplayOrder = useCallback(
    (list: AIMessage[]): UiMessage[] =>
      [...list].reverse().map((msg) => ({
        id: `msg-${msg.ID}`,
        content: msg.content,
        role: msg.role === "user" ? "user" : "ai",
        status: (msg.status === "loading" ? "loading" : msg.status === "error" ? "error" : "success") as UiMessage["status"],
        timestamp: new Date(msg.createdAt).getTime(),
      })),
    []
  );

  const navigateToConversation = useCallback(
    (id: number, replace = false) => {
      const sp = new URLSearchParams(location.search);
      sp.set("conversationId", String(id));
      navigate({ pathname: location.pathname, search: sp.toString() }, { replace });
    },
    [navigate, location.pathname, location.search]
  );

  /** 列表里存在未完成的 AI 条目标记为 loading 时，由 worker 续传；与 sendMessage(resume) 共用一套启动逻辑 */
  const beginResumeStream = useCallback(
    (cid: number, loadingMsg: UiMessage, resumeContent: string, mode: ChatMode) => {
      live.current.streamingAiMsgId = loadingMsg.id;
      markConversationStreaming(cid);
      try {
        live.current.refreshSessionsAfterStream = true;
        aiChatStreamClient.start(cid, resumeContent, mode, true);
      } catch (error) {
        console.error("恢复流式输出失败:", error);
        antdMessage.error("恢复流式输出失败");
        live.current.refreshSessionsAfterStream = false;
        setMessages((msgs) => {
          const idx = msgs.findIndex((m) => m.id === loadingMsg.id);
          if (idx === -1) return msgs;
          const next = msgs.slice();
          next[idx] = { ...next[idx]!, content: "恢复失败，请重试", status: "error" };
          return next;
        });
        markConversationStreamEnded(cid);
      }
    },
    [markConversationStreaming, markConversationStreamEnded]
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

            const loadingMsg = messageList.find((m) => m.role === "ai" && m.status === "loading");
            if (loadingMsg) {
              const loadingIdx = messageList.indexOf(loadingMsg);
              const userMsg = loadingIdx > 0 ? messageList[loadingIdx - 1] : null;
              setTimeout(() => {
                beginResumeStream(cid, loadingMsg, userMsg?.content || "", "aiserver_chat");
              }, 0);
            }
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
    [PAGE_SIZE, toDisplayOrder, beginResumeStream]
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
    async (
      userContent: string,
      mode: ChatMode = "aiserver_chat",
      targetConversationId?: number,
      resume = false,
      deepThink = false,
      imageBase64?: string
    ): Promise<boolean> => {
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

      if (streamingConversationIdsRef.current.has(cid)) {
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
        beginResumeStream(cid, loadingMsg, content, mode);
        return true;
      }

      const userMsg: UiMessage = {
        id: `user-${Date.now()}`,
        content,
        role: "user",
        status: "success",
        timestamp: Date.now(),
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

      markConversationStreaming(cid);

      try {
        live.current.refreshSessionsAfterStream = true;
        aiChatStreamClient.start(cid, content, mode, false, deepThink, imageBase64);
        return true;
      } catch (error) {
        console.error("发送消息失败:", error);
        antdMessage.error("发送消息失败");
        live.current.refreshSessionsAfterStream = false;
        setMessages((prev) => {
          const withoutAi = prev.filter((m) => m.id !== aiMsgId);
          return [
            ...withoutAi,
            {
              id: aiMsgId,
              content: "发送失败，请重试",
              role: "ai",
              status: "error",
              timestamp: Date.now(),
            },
          ];
        });
        optionsRef.current.onAfterMessagesChange?.();
        markConversationStreamEnded(cid);
        return false;
      }
    },
    [
      conversationId,
      beginResumeStream,
      navigateToConversation,
      markConversationStreaming,
      markConversationStreamEnded,
    ]
  );

  useEffect(() => {
    return aiChatStreamClient.subscribeStreamLifecycle((snap) => {
      // 仅 done / error 视为结束；idle 可能出现在「同会话打断旧流」的竞态中，不能用来清 loading
      if (snap.status === "done" || snap.status === "error") {
        markConversationStreamEnded(snap.conversationId);
      }
    });
  }, [markConversationStreamEnded]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  /** 离开 AI 页时中止 Worker 内全部 SSE，避免旧连接未断又与下次 resume 并行 */
  useEffect(() => {
    return () => {
      aiChatStreamClient.stopAllStreams();
      streamingConversationIdsRef.current.clear();
    };
  }, []);

  // 切换会话时在下一次绘制前清空旧消息；从草稿首次落盘到某会话时不清理（由首条 sendMessage 写入）
  useLayoutEffect(() => {
    if (conversationId == null || !Number.isFinite(conversationId)) {
      suppressEmptyHydrateRef.current = null;
      setMessages([]);
      setMessagePagination(null);
      setMessagesLoading(false);
      return;
    }
    if (suppressEmptyHydrateRef.current === conversationId) {
      suppressEmptyHydrateRef.current = null;
      setMessagePagination(null);
      setMessagesLoading(true);
      return;
    }
    setMessages([]);
    setMessagePagination(null);
    setMessagesLoading(true);
  }, [conversationId]);

  useEffect(() => {
    if (conversationId == null || !Number.isFinite(conversationId)) return;
    void loadMessagesFirstPage(conversationId);
  }, [conversationId, loadMessagesFirstPage]);

  // Worker 订阅：仅当前 URL 会话
  useEffect(() => {
    if (conversationId == null || !Number.isFinite(conversationId)) return;

    const unsub = aiChatStreamClient.subscribe(conversationId, (snap) => {
      if (live.current.conversationId !== conversationId) return;

      const streamMsgId = live.current.streamingAiMsgId;

      const findTargetIdx = (current: UiMessage[]): number => {
        if (streamMsgId) {
          const idx = current.findIndex((m) => m.id === streamMsgId);
          if (idx !== -1) return idx;
        }
        return current.findIndex((m) => m.role === "ai" && m.status === "loading");
      };

      const isStreamingPhase = snap.status === "streaming" || snap.status === "idle";

      const hasThinking = snap.thinkingProcess || snap.thinkingStatus;
      const hasStep = snap.stepStatus != null;

      if (snap.fullText && isStreamingPhase) {
        setMessages((prev) => {
          const idx = findTargetIdx(prev);
          if (idx !== -1) {
            const next = prev.slice();
            next[idx] = {
              ...next[idx]!,
              content: snap.fullText,
              stepStatus: snap.stepStatus,
              ...(hasThinking
                ? {
                    thinkingProcess: snap.thinkingProcess,
                    thinkingStatus: snap.thinkingStatus,
                  }
                : {}),
            };
            return next;
          }
          return [
            ...prev,
            {
              id: streamMsgId ?? `ai-${Date.now()}`,
              content: snap.fullText,
              role: "ai",
              status: "loading",
              timestamp: Date.now(),
              stepStatus: snap.stepStatus,
              ...(hasThinking
                ? {
                    thinkingProcess: snap.thinkingProcess,
                    thinkingStatus: snap.thinkingStatus,
                  }
                : {}),
            },
          ];
        });
      }

      startTransition(() => {
        setMessages((prev) => {
          const idx = findTargetIdx(prev);
          if (idx === -1) return prev;
          const existingMsg = prev[idx];
          if (!existingMsg) return prev;
          const status: UiMessage["status"] =
            snap.status === "error" ? "error" : snap.status === "done" ? "success" : "loading";
          const nextContent = snap.fullText || existingMsg.content;
          const contentChanged = existingMsg.content !== nextContent;
          const statusChanged = existingMsg.status !== status;
          const thinkingChanged =
            hasThinking &&
            (existingMsg.thinkingProcess !== snap.thinkingProcess ||
              existingMsg.thinkingStatus !== snap.thinkingStatus);
          const stepChanged = hasStep && existingMsg.stepStatus !== snap.stepStatus;
          if (!contentChanged && !statusChanged && !thinkingChanged && !stepChanged) {
            return prev;
          }
          const next = prev.slice();
          next[idx] = {
            ...existingMsg,
            content: nextContent,
            status,
            stepStatus: snap.stepStatus,
            ...(hasThinking
              ? {
                  thinkingProcess: snap.thinkingProcess,
                  thinkingStatus: snap.thinkingStatus,
                }
              : {}),
          };
          return next;
        });
      });

      if (snap.status === "done" || snap.status === "error") {
        live.current.streamingAiMsgId = null;
        if (snap.status === "done" && live.current.refreshSessionsAfterStream) {
          live.current.refreshSessionsAfterStream = false;
          void loadSessions();
        } else if (snap.status === "error") {
          live.current.refreshSessionsAfterStream = false;
        }
      }
    });
    aiChatStreamClient.requestSnapshot(conversationId);
    return () => unsub();
  }, [conversationId, loadSessions]);

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

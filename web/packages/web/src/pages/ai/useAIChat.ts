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
import {
  createResumeAiPlaceholder,
  findResumeAiMessage,
  shouldAutoResume,
} from "./chatResume";
import { buildChatUrl, readSseStream } from "./chatSse";
import { createChatStreamHandlers } from "./chatStreamHandlers";
import { conversationTitleFromFirstMessage } from "./conversationTitle";
import { apiMessagesToUi } from "./mapApiMessage";
import type { UiMessage, SendOptions } from "./types";

export type { UiMessage, SendOptions } from "./types";

interface UseAIChatOptions {
  pageSize?: number;
  onAfterMessagesChange?: () => void;
}

interface LiveSnapshot {
  conversationId: number | null;
  sessions: AIConversation[];
  messages: UiMessage[];
  streamingAiMsgId: string | null;
  streamingConversationId: number | null;
  refreshSessionsAfterStream: boolean;
}

/**
 * AI 对话数据层（路由级会话）
 *
 * - `conversationId` 来自 URL；切换会话 = 路由变化。
 * - `live` ref：异步回调中读取最新 state，避免闭包过期。
 * - 无 URL 会话时首条发送再 createConversation，避免空会话。
 * - `loading` 仅表示当前 URL 会话是否在流式生成。
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
  const [loading, setLoading] = useState(false);

  const sseAbortControllerRef = useRef<AbortController | null>(null);
  const streamingConversationIdRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const suppressEmptyHydrateRef = useRef<number | null>(null);

  const live = useRef<LiveSnapshot>({
    conversationId: null,
    sessions: [],
    messages: [],
    streamingAiMsgId: null,
    streamingConversationId: null,
    refreshSessionsAfterStream: false,
  });
  live.current.conversationId = conversationId;
  live.current.sessions = sessions;
  live.current.messages = messages;

  const navigateToConversation = useCallback(
    (id: number, replace = false) => {
      const sp = new URLSearchParams(location.search);
      sp.set("conversationId", String(id));
      navigate({ pathname: location.pathname, search: sp.toString() }, { replace });
    },
    [navigate, location.pathname, location.search]
  );

  const clearStreamRefs = useCallback(() => {
    sseAbortControllerRef.current = null;
    streamingConversationIdRef.current = null;
    live.current.streamingConversationId = null;
    live.current.streamingAiMsgId = null;
  }, []);

  const abortActiveSSE = useCallback(() => {
    sseAbortControllerRef.current?.abort();
    clearStreamRefs();
    setLoading(false);
  }, [clearStreamRefs]);

  const startSSEStream = useCallback(
    (cid: number, aiMsgId: string, url: string, body: Record<string, unknown>) => {
      const ctrl = new AbortController();
      sseAbortControllerRef.current = ctrl;
      streamingConversationIdRef.current = cid;
      live.current.streamingConversationId = cid;
      live.current.streamingAiMsgId = aiMsgId;
      setLoading(true);
      live.current.refreshSessionsAfterStream = true;

      const isCurrentStream = () =>
        live.current.conversationId === cid && streamingConversationIdRef.current === cid;

      const handlers = createChatStreamHandlers({
        cid,
        aiMsgId,
        isCurrentStream,
        liveMessages: () => live.current.messages,
        setLoading,
        setMessages,
        setSessions,
        onStreamEnd: clearStreamRefs,
        onAfterMessagesChange: () => optionsRef.current.onAfterMessagesChange?.(),
        notifyError: (err) => antdMessage.error(err),
      });

      void readSseStream(url, body, handlers, ctrl.signal);
    },
    [clearStreamRefs]
  );

  const tryResumeIfNeeded = useCallback(
    (cid: number, apiRows: AIMessage[], displayList: UiMessage[]) => {
      if (sseAbortControllerRef.current || apiRows.length === 0) return;

      const apiNewest = apiRows[0]!;
      const session = live.current.sessions.find((s) => s.ID === cid);
      const convStillLoading = session?.latestStatus === "loading";

      if (!shouldAutoResume(apiNewest, convStillLoading)) return;

      let aiMsg = findResumeAiMessage(displayList, apiNewest);
      if (!aiMsg) {
        aiMsg = createResumeAiPlaceholder();
        live.current.streamingAiMsgId = aiMsg.id;
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
        setSessions(res.data.list || []);
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
            return;
          }

          const messageList = apiMessagesToUi(rows);
          setMessages(messageList);
          setMessagePagination({ page: 1, total });
          optionsRef.current.onAfterMessagesChange?.();
          setTimeout(() => tryResumeIfNeeded(cid, rows, messageList), 0);
          return;
        }

        antdMessage.error(res.msg || "加载消息失败");
        setMessages([]);
        setMessagePagination({ page: 0, total: 0 });
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
    [PAGE_SIZE, tryResumeIfNeeded]
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
        const olderMessages = apiMessagesToUi((res.data.list || []) as AIMessage[]);
        setMessages((prev) => [...olderMessages, ...prev]);
        setMessagePagination({ page: nextPage, total });
      }
    } catch (error) {
      console.error("加载更多消息失败:", error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [conversationId, messagePagination, PAGE_SIZE]);

  const openNewDraft = useCallback(() => {
    navigate({ pathname: location.pathname, search: "" }, { replace: true });
  }, [navigate, location.pathname]);

  const deleteSession = useCallback(
    async (key: string) => {
      const idToDelete = parseInt(key, 10);
      if (isNaN(idToDelete)) return;

      try {
        const res = await aiApi.deleteConversation(idToDelete);
        if (res.code !== 0) {
          antdMessage.error(res.msg || "删除失败");
          return;
        }

        const wasCurrent = live.current.conversationId === idToDelete;
        const remaining = live.current.sessions.filter((s) => s.ID !== idToDelete);
        setSessions(remaining);

        if (wasCurrent) {
          if (remaining.length > 0) {
            navigateToConversation(remaining[0]!.ID, true);
          } else {
            navigate({ pathname: location.pathname, search: "" }, { replace: true });
          }
        }

        antdMessage.success("删除成功");
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

  const resolveConversationId = useCallback(
    async (
      userContent: string,
      targetId: number | undefined,
      resume: boolean | undefined
    ): Promise<number | null> => {
      let cid = targetId ?? conversationId;

      if ((cid == null || !Number.isFinite(cid)) && !resume) {
        const title = conversationTitleFromFirstMessage(userContent.trim());
        try {
          const res = await aiApi.createConversation({ title });
          if (res.code !== 0 || !res.data) {
            antdMessage.error(res.msg || "创建会话失败");
            return null;
          }
          setSessions((prev) => [res.data!, ...prev]);
          cid = res.data.ID;
          suppressEmptyHydrateRef.current = cid;
          navigateToConversation(cid, true);
        } catch (error) {
          console.error("创建会话失败:", error);
          antdMessage.error("创建会话失败");
          return null;
        }
      }

      if (cid == null || !Number.isFinite(cid)) {
        antdMessage.error("会话ID无效");
        return null;
      }

      return cid;
    },
    [conversationId, navigateToConversation]
  );

  const sendMessage = useCallback(
    async (sendOpts: SendOptions): Promise<boolean> => {
      const {
        content: userContent,
        useKnowledge,
        useSearch,
        targetConversationId,
        resume,
        attachments,
      } = sendOpts;

      if (!userContent.trim() && !resume) return false;

      const cid = await resolveConversationId(userContent, targetConversationId, resume);

      if (cid == null) return false;

      if (sseAbortControllerRef.current && streamingConversationIdRef.current === cid) {
        antdMessage.warning("该会话正在回复中，请稍后再试");
        return false;
      }

      const content = userContent.trim();

      if (resume) {
        const loadingMsg = live.current.messages.find(
          (m) => m.role === "ai" && m.status === "loading"
        );
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

      const aiMsgId = `ai-${Date.now()}`;
      live.current.streamingAiMsgId = aiMsgId;

      setMessages((prev) => {
        const withoutLoading = prev.filter((m) => !(m.role === "ai" && m.status === "loading"));
        return [
          ...withoutLoading,
          {
            id: `user-${Date.now()}`,
            content,
            role: "user",
            status: "success",
            timestamp: Date.now(),
            attachments,
          },
          {
            id: aiMsgId,
            content: "",
            role: "ai",
            status: "loading",
            timestamp: Date.now(),
          },
        ];
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
    [resolveConversationId, startSSEStream]
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => () => abortActiveSSE(), [abortActiveSSE]);

  useLayoutEffect(() => {
    // 首条消息 createConversation 会改 URL；同会话流式进行中也不应 abort
    const keepStream =
      (conversationId != null &&
        suppressEmptyHydrateRef.current === conversationId) ||
      (conversationId != null &&
        streamingConversationIdRef.current === conversationId);

    if (!keepStream) {
      abortActiveSSE();
    }

    if (conversationId == null || !Number.isFinite(conversationId)) {
      suppressEmptyHydrateRef.current = null;
      setMessages([]);
      setMessagePagination(null);
      setMessagesLoading(false);
      return;
    }

    if (suppressEmptyHydrateRef.current === conversationId) {
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

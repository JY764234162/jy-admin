import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message as antdMessage } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/ai";
import { aiChatStreamClient } from "@/workers/aiChatStreamClient";

// 前端消息类型（适配 UI 组件）
export interface UiMessage {
  id: string;
  content: string;
  role: "user" | "ai";
  status?: "loading" | "success" | "error";
  timestamp: number;
}

interface UseAIChatOptions {
  pageSize?: number;
  /** 每次消息/流式更新后回调（用于 UI 决定是否滚动到底部等） */
  onAfterMessagesChange?: () => void;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const PAGE_SIZE = options.pageSize ?? 10;

  const [sessions, setSessions] = useState<AIConversation[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [messagesBySession, setMessagesBySession] = useState<Record<string, UiMessage[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messagePagination, setMessagePagination] = useState<Record<string, { page: number; total: number }>>({});

  // 防止重复触发 loadMore
  const loadingMoreRef = useRef(false);
  // 当前会话的流式订阅解绑（页面卸载时解绑，但不停止 worker 流）
  const currentStreamUnsubRef = useRef<null | (() => void)>(null);
  const currentStreamIdRef = useRef<string | null>(null);
  // 仅当“本 hook 发起的本次生成”结束时才刷新会话列表，避免切换会话时 snapshot(done) 也触发刷新
  const shouldRefreshSessionsRef = useRef(false);
  // 避免闭包拿到旧 sessions
  const sessionsRef = useRef<AIConversation[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const currentMessages = useMemo(() => messagesBySession[activeKey] || [], [messagesBySession, activeKey]);

  // 后端返回时间倒序（最新在前），转为展示顺序：旧在上、新在下（正序）
  const toDisplayOrder = useCallback(
    (list: { ID: number; content: string; role: string; createdAt: string }[]): UiMessage[] =>
      [...list].reverse().map((msg) => ({
        id: `msg-${msg.ID}`,
        content: msg.content,
        role: msg.role === "user" ? "user" : "ai",
        status: "success" as const,
        timestamp: new Date(msg.createdAt).getTime(),
      })),
    []
  );

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await aiApi.getConversationList({ page: 1, pageSize: 100 });
      if (res.code === 0 && res.data) {
        const sessionList = res.data.list || [];
        setSessions(sessionList);
        if (sessionList.length > 0) {
          setActiveKey((prev) => prev || (sessionList[0]?.ID.toString() ?? ""));
        }
      }
    } catch (error) {
      console.error("加载会话列表失败:", error);
      antdMessage.error("加载会话列表失败");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: number) => {
      const key = conversationId.toString();
      try {
        const res = await aiApi.getMessageList(conversationId, { page: 1, pageSize: PAGE_SIZE });
        if (res.code === 0 && res.data) {
          const { list = [], total = 0 } = res.data;
          const messageList = toDisplayOrder((list || []) as AIMessage[]);
          setMessagesBySession((prev) => ({ ...prev, [key]: messageList }));
          setMessagePagination((prev) => ({ ...prev, [key]: { page: 1, total } }));
          options.onAfterMessagesChange?.();
        } else {
          antdMessage.error(res.msg || "加载消息失败");
          setMessagesBySession((prev) => ({ ...prev, [key]: [] }));
          setMessagePagination((prev) => ({ ...prev, [key]: { page: 0, total: 0 } }));
        }
      } catch (error) {
        console.error("加载消息失败:", error);
        antdMessage.error("加载消息失败");
        setMessagesBySession((prev) => ({ ...prev, [key]: [] }));
        setMessagePagination((prev) => ({ ...prev, [key]: { page: 0, total: 0 } }));
      }
    },
    [PAGE_SIZE, toDisplayOrder, options]
  );

  const loadMoreHistory = useCallback(async () => {
    if (!activeKey) return;
    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) return;

    const pagination = messagePagination[activeKey];
    if (!pagination || loadingMoreRef.current) return;
    const { page, total } = pagination;
    if (page * PAGE_SIZE >= total) return;

    loadingMoreRef.current = true;
    const nextPage = page + 1;
    try {
      const res = await aiApi.getMessageList(conversationId, { page: nextPage, pageSize: PAGE_SIZE });
      if (res.code === 0 && res.data) {
        const { list = [] } = res.data;
        const olderMessages = toDisplayOrder((list || []) as AIMessage[]);
        setMessagesBySession((prev) => {
          const currentMsgs = prev[activeKey] || [];
          return { ...prev, [activeKey]: [...olderMessages, ...currentMsgs] };
        });
        setMessagePagination((prev) => ({ ...prev, [activeKey]: { page: nextPage, total } }));
      }
    } catch (error) {
      console.error("加载更多消息失败:", error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [activeKey, messagePagination, PAGE_SIZE, toDisplayOrder]);

  const addSession = useCallback(async () => {
    try {
      const res = await aiApi.createConversation({ title: "新对话" });
      if (res.code === 0 && res.data) {
        const newSession = res.data;
        setSessions((prev) => [newSession, ...prev]);
        setMessagesBySession((prev) => ({ ...prev, [newSession.ID.toString()]: [] }));
        setMessagePagination((prev) => ({ ...prev, [newSession.ID.toString()]: { page: 0, total: 0 } }));
        setActiveKey(newSession.ID.toString());
      } else {
        antdMessage.error(res.msg || "创建会话失败");
      }
    } catch (error) {
      console.error("创建会话失败:", error);
      antdMessage.error("创建会话失败");
    }
  }, []);

  const deleteSession = useCallback(
    async (key: string) => {
      const conversationId = parseInt(key);
      if (isNaN(conversationId)) return;

      try {
        const res = await aiApi.deleteConversation(conversationId);
        if (res.code === 0) {
          setSessions((prev) => prev.filter((s) => s.ID !== conversationId));
          setMessagesBySession((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setMessagePagination((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setActiveKey((prev) => {
            if (prev !== key) return prev;
            const remaining = (sessionsRef.current || []).filter((s) => s.ID !== conversationId);
            return remaining.length > 0 ? remaining[0]?.ID.toString() ?? "" : "";
          });
          antdMessage.success("删除成功");
        } else {
          antdMessage.error(res.msg || "删除失败");
        }
      } catch (error) {
        console.error("删除会话失败:", error);
        antdMessage.error("删除会话失败");
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (userContent: string) => {
      if (!userContent.trim() || !activeKey) return;

      const conversationId = parseInt(activeKey);
      if (isNaN(conversationId)) {
        antdMessage.error("会话ID无效");
        return;
      }

      const content = userContent.trim();
      const userMsg: UiMessage = {
        id: `user-${Date.now()}`,
        content,
        role: "user",
        status: "success",
        timestamp: Date.now(),
      };

      // 进行中的 AI 消息使用稳定 id，便于“切路由回来继续更新”
      const aiMsgId = `ai-stream-${conversationId}`;
      const initialAiMsg: UiMessage = {
        id: aiMsgId,
        content: "",
        role: "ai",
        status: "loading",
        timestamp: Date.now(),
      };

      setMessagesBySession((prev) => {
        const current = prev[activeKey] || [];
        // 如果上一次还有遗留的 streaming 消息（同 id），先移除再追加
        const withoutOldStream = current.filter((m) => m.id !== aiMsgId);
        return { ...prev, [activeKey]: [...withoutOldStream, userMsg, initialAiMsg] };
      });
      options.onAfterMessagesChange?.();

      setLoading(true);

      try {
        // 启动 worker 流（流式更新由 activeKey 的订阅 effect 统一处理）
        shouldRefreshSessionsRef.current = true;
        const streamId = aiChatStreamClient.start(conversationId, content);
        currentStreamIdRef.current = streamId;
      } catch (error) {
        console.error("发送消息失败:", error);
        antdMessage.error("发送消息失败");
        shouldRefreshSessionsRef.current = false;
        setMessagesBySession((prev) => {
          const current = prev[activeKey] || [];
          const withoutAi = current.filter((m) => m.id !== aiMsgId);
          return {
            ...prev,
            [activeKey]: [
              ...withoutAi,
              { id: aiMsgId, content: "发送失败，请重试", role: "ai", status: "error", timestamp: Date.now() },
            ],
          };
        });
        options.onAfterMessagesChange?.();
        setLoading(false);
      }
    },
    [activeKey, loadSessions, options]
  );

  // 页面卸载（或路由切换导致组件卸载）时：解绑订阅即可（worker 继续跑）
  useEffect(() => {
    return () => {
      currentStreamUnsubRef.current?.();
      currentStreamUnsubRef.current = null;
      setLoading(false);
    };
  }, []);

  // 初始化
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 切换会话时懒加载消息
  useEffect(() => {
    if (!activeKey) return;
    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) return;
    if (!messagesBySession[activeKey]) {
      loadMessages(conversationId);
    }
  }, [activeKey, messagesBySession, loadMessages]);

  // 进入页面/切换会话时：向 worker 拉取最新 snapshot，并尽快把“正在生成的那条 AI 消息”恢复到最新文本
  useEffect(() => {
    if (!activeKey) return;
    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) return;

    const unsub = aiChatStreamClient.subscribe(conversationId, (snap) => {
      const streamMsgId = `ai-stream-${conversationId}`;

      // streaming/idle 时，如果有文本但 UI 没有占位消息，则自动补一条，保证“切路由回来继续打字”
      if (snap.fullText && (snap.status === "streaming" || snap.status === "idle")) {
        setMessagesBySession((prev) => {
          const current = prev[activeKey] || [];
          const idx = current.findIndex((m) => m.id === streamMsgId);
          if (idx !== -1) return prev;
          return {
            ...prev,
            [activeKey]: [
              ...current,
              {
                id: streamMsgId,
                content: snap.fullText,
                role: "ai",
                status: "loading",
                timestamp: Date.now(),
              },
            ],
          };
        });
      }

      setMessagesBySession((prev) => {
        const current = prev[activeKey] || [];
        const idx = current.findIndex((m) => m.id === streamMsgId);
        if (idx === -1) return prev;
        const next = current.slice();
        const status: UiMessage["status"] =
          snap.status === "error" ? "error" : snap.status === "done" ? "success" : "loading";
        const existingMsg = next[idx];
        if (!existingMsg) return prev;
        next[idx] = { ...existingMsg, content: snap.fullText, status };
        return { ...prev, [activeKey]: next };
      });

      if (snap.status === "done") {
        setLoading(false);
        if (shouldRefreshSessionsRef.current) {
          shouldRefreshSessionsRef.current = false;
          loadSessions();
        }
      } else if (snap.status === "error") {
        setLoading(false);
        shouldRefreshSessionsRef.current = false;
      } else if (snap.status === "streaming") {
        setLoading(true);
      }
    });
    aiChatStreamClient.requestSnapshot(conversationId);
    return () => unsub();
  }, [activeKey]);

  return {
    PAGE_SIZE,
    sessions,
    activeKey,
    setActiveKey,
    currentMessages,
    messagesBySession,
    loading,
    loadingSessions,
    messagePagination,
    loadSessions,
    loadMessages,
    loadMoreHistory,
    addSession,
    deleteSession,
    sendMessage,
  };
}


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message as antdMessage } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/ai";
import { aiChatStreamClient } from "@/workers/aiChatStreamClient";
import type { ChatMode, UiMessage } from "./types";

export type { ChatMode, UiMessage } from "./types";

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
  // 仅当"本 hook 发起的本次生成"结束时才刷新会话列表，避免切换会话时 snapshot(done) 也触发刷新
  const shouldRefreshSessionsRef = useRef(false);
  // 当前活跃流对应的 AI 消息 id（每条独立，避免覆盖旧回复）
  const currentAiMsgIdRef = useRef<string | null>(null);
  // 避免闭包拿到旧 sessions / messages
  const sessionsRef = useRef<AIConversation[]>([]);
  const messagesBySessionRef = useRef<Record<string, UiMessage[]>>({});
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    messagesBySessionRef.current = messagesBySession;
  }, [messagesBySession]);

  const currentMessages = useMemo(() => messagesBySession[activeKey] || [], [messagesBySession, activeKey]);

  // 后端返回时间倒序（最新在前），转为展示顺序：旧在上、新在下（正序）
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

          // 加载完成后，若 sessionStorage 中有 pending 请求且当前会话存在 loading 消息，自动恢复
          const pendingRaw = sessionStorage.getItem("ai_pending_request");
          if (pendingRaw) {
            try {
              const pending = JSON.parse(pendingRaw);
              if (pending.conversationId === conversationId) {
                const hasLoading = messageList.some((m) => m.role === "ai" && m.status === "loading");
                if (hasLoading) {
                  setTimeout(() => {
                    sendMessage(pending.content, pending.mode, pending.conversationId, true);
                  }, 0);
                } else {
                  // 没有 loading 消息，说明后端已处理完，清除 pending
                  sessionStorage.removeItem("ai_pending_request");
                }
              }
            } catch {
              sessionStorage.removeItem("ai_pending_request");
            }
          }
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
        return newSession.ID;
      } else {
        antdMessage.error(res.msg || "创建会话失败");
      }
    } catch (error) {
      console.error("创建会话失败:", error);
      antdMessage.error("创建会话失败");
    }
    return null;
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

  const renameSession = useCallback(
    async (key: string, newTitle: string) => {
      const conversationId = parseInt(key);
      if (isNaN(conversationId)) {
        antdMessage.error("会话ID无效");
        return false;
      }
      const trimmed = newTitle.trim();
      if (!trimmed) {
        antdMessage.error("标题不能为空");
        return false;
      }
      try {
        const res = await aiApi.updateConversationTitle(conversationId, { title: trimmed });
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
    async (userContent: string, mode: ChatMode = "aiserver_chat", targetConversationId?: number, resume = false) => {
      const conversationId = targetConversationId ?? parseInt(activeKey);
      if (!userContent.trim() || isNaN(conversationId)) {
        if (isNaN(conversationId)) antdMessage.error("会话ID无效");
        return;
      }
      if (loading) {
        antdMessage.warning("AI 正在回复中，请稍后再试");
        return;
      }

      const key = conversationId.toString();
      const content = userContent.trim();

      if (resume) {
        // 恢复模式：复用已有的 loading AI 消息，不添加新的 user 消息
        const current = messagesBySessionRef.current[key] || [];
        const loadingMsg = current.find((m) => m.role === "ai" && m.status === "loading");
        if (!loadingMsg) {
          antdMessage.error("没有可恢复的 AI 消息");
          return;
        }
        currentAiMsgIdRef.current = loadingMsg.id;
        setLoading(true);
        try {
          shouldRefreshSessionsRef.current = true;
          const streamId = aiChatStreamClient.start(conversationId, content, mode, true);
          currentStreamIdRef.current = streamId;
        } catch (error) {
          console.error("恢复流式输出失败:", error);
          antdMessage.error("恢复流式输出失败");
          shouldRefreshSessionsRef.current = false;
          setMessagesBySession((prev) => {
            const msgs = prev[key] || [];
            const idx = msgs.findIndex((m) => m.id === loadingMsg.id);
            if (idx === -1) return prev;
            const next = msgs.slice();
            next[idx] = { ...next[idx]!, content: "恢复失败，请重试", status: "error" };
            return { ...prev, [key]: next };
          });
          setLoading(false);
        }
        return;
      }

      // 正常模式
      const userMsg: UiMessage = {
        id: `user-${Date.now()}`,
        content,
        role: "user",
        status: "success",
        timestamp: Date.now(),
      };

      const aiMsgId = `ai-${Date.now()}`;
      currentAiMsgIdRef.current = aiMsgId;
      const initialAiMsg: UiMessage = {
        id: aiMsgId,
        content: "",
        role: "ai",
        status: "loading",
        timestamp: Date.now(),
      };

      setMessagesBySession((prev) => {
        const current = prev[key] || [];
        const withoutLoading = current.filter(
          (m) => !(m.role === "ai" && m.status === "loading")
        );
        return { ...prev, [key]: [...withoutLoading, userMsg, initialAiMsg] };
      });
      options.onAfterMessagesChange?.();

      setLoading(true);

      try {
        shouldRefreshSessionsRef.current = true;
        const streamId = aiChatStreamClient.start(conversationId, content, mode);
        currentStreamIdRef.current = streamId;

        // 保存 pending 请求到 sessionStorage，刷新后自动恢复
        sessionStorage.setItem(
          "ai_pending_request",
          JSON.stringify({ conversationId, content, mode, timestamp: Date.now() })
        );
      } catch (error) {
        console.error("发送消息失败:", error);
        antdMessage.error("发送消息失败");
        shouldRefreshSessionsRef.current = false;
        sessionStorage.removeItem("ai_pending_request");
        setMessagesBySession((prev) => {
          const current = prev[key] || [];
          const withoutAi = current.filter((m) => m.id !== currentAiMsgIdRef.current);
          return {
            ...prev,
            [key]: [
              ...withoutAi,
              { id: currentAiMsgIdRef.current ?? `ai-${Date.now()}`, content: "发送失败，请重试", role: "ai", status: "error", timestamp: Date.now() },
            ],
          };
        });
        options.onAfterMessagesChange?.();
        setLoading(false);
      }
    },
    [activeKey, loadSessions, options, loading]
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

  // 进入页面/切换会话时：向 worker 拉取最新 snapshot，并尽快把"正在生成的那条 AI 消息"恢复到最新文本
  useEffect(() => {
    if (!activeKey) return;
    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) return;

    const unsub = aiChatStreamClient.subscribe(conversationId, (snap) => {
      const streamMsgId = currentAiMsgIdRef.current;

      // 查找目标 AI 消息的索引：优先匹配 streamMsgId，否则找 loading 状态的 AI 消息
      const findTargetIdx = (current: UiMessage[]): number => {
        if (streamMsgId) {
          const idx = current.findIndex((m) => m.id === streamMsgId);
          if (idx !== -1) return idx;
        }
        return current.findIndex((m) => m.role === "ai" && m.status === "loading");
      };

      // streaming/idle 时，如果有文本但 UI 没有占位消息，则自动补一条，保证"切路由回来继续打字"
      if (snap.fullText && (snap.status === "streaming" || snap.status === "idle")) {
        setMessagesBySession((prev) => {
          const current = prev[activeKey] || [];
          const idx = findTargetIdx(current);
          if (idx !== -1) {
            const next = current.slice();
            next[idx] = { ...next[idx]!, content: snap.fullText };
            return { ...prev, [activeKey]: next };
          }
          return {
            ...prev,
            [activeKey]: [
              ...current,
              {
                id: streamMsgId ?? `ai-${Date.now()}`,
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
        const idx = findTargetIdx(current);
        if (idx === -1) return prev;
        const next = current.slice();
        const status: UiMessage["status"] =
          snap.status === "error" ? "error" : snap.status === "done" ? "success" : "loading";
        const existingMsg = next[idx];
        if (!existingMsg) return prev;
        next[idx] = { ...existingMsg, content: snap.fullText, status };
        return { ...prev, [activeKey]: next };
      });

      if (snap.status === "done" || snap.status === "error") {
        setLoading(false);
        currentAiMsgIdRef.current = null;
        sessionStorage.removeItem("ai_pending_request");
        if (snap.status === "done" && shouldRefreshSessionsRef.current) {
          shouldRefreshSessionsRef.current = false;
          loadSessions();
        } else if (snap.status === "error") {
          shouldRefreshSessionsRef.current = false;
        }
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
    renameSession,
    sendMessage,
  };
}


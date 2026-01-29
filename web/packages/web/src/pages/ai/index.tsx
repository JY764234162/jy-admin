import React, { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Bubble, Conversations, Sender, type ConversationsProps } from "@ant-design/x";
import { UserOutlined, PlusOutlined, MessageOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Layout, theme, Empty, Flex, Avatar, message as antdMessage } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/ai";
const { Sider, Content } = Layout;

// 前端消息类型（适配 UI 组件）
interface Message {
  id: string;
  content: string;
  role: "user" | "ai";
  status?: "loading" | "success" | "error";
  timestamp: number;
}

export const Component = () => {
  const { token } = theme.useToken();

  const PAGE_SIZE = 10;

  // 状态管理
  const [sessions, setSessions] = useState<AIConversation[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  // 每个会话的分页：{ page, total }，用于上拉加载更多
  const [messagePagination, setMessagePagination] = useState<Record<string, { page: number; total: number }>>({});

  // 滚动到底部的引用 & 消息列表滚动容器
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messageScrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeKey]);

  // 加载会话列表
  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await aiApi.getConversationList({ page: 1, pageSize: 100 });
      if (res.code === 0 && res.data) {
        const sessionList = res.data.list || [];
        setSessions(sessionList);
        // 如果有会话且没有激活的，激活第一个
        if (sessionList.length > 0 && !activeKey) {
          setActiveKey(sessionList[0].ID.toString());
        }
      }
    } catch (error) {
      console.error("加载会话列表失败:", error);
      antdMessage.error("加载会话列表失败");
    } finally {
      setLoadingSessions(false);
    }
  };

  // 后端返回时间倒序（最新在前），转为展示顺序：旧在上、新在下（正序）
  const toDisplayOrder = (list: { ID: number; content: string; role: string; createdAt: string }[]): Message[] =>
    [...list].reverse().map((msg) => ({
      id: `msg-${msg.ID}`,
      content: msg.content,
      role: msg.role === "user" ? "user" : "ai",
      status: "success" as const,
      timestamp: new Date(msg.createdAt).getTime(),
    }));

  // 加载会话消息（第一页，默认最近 10 条）
  const loadMessages = async (conversationId: number) => {
    const key = conversationId.toString();
    try {
      const res = await aiApi.getMessageList(conversationId, { page: 1, pageSize: PAGE_SIZE });
      if (res.code === 0 && res.data) {
        const { list = [], total = 0 } = res.data;
        const messageList = toDisplayOrder((list || []) as AIMessage[]);
        setMessages((prev) => ({ ...prev, [key]: messageList }));
        setMessagePagination((prev) => ({ ...prev, [key]: { page: 1, total } }));
      } else {
        antdMessage.error(res.msg || "加载消息失败");
        setMessages((prev) => ({ ...prev, [key]: [] }));
        setMessagePagination((prev) => ({ ...prev, [key]: { page: 0, total: 0 } }));
      }
    } catch (error) {
      console.error("加载消息失败:", error);
      antdMessage.error("加载消息失败");
      setMessages((prev) => ({ ...prev, [key]: [] }));
      setMessagePagination((prev) => ({ ...prev, [key]: { page: 0, total: 0 } }));
    }
  };

  // 上拉加载更多历史消息（拼接到当前消息前面）
  const loadMoreHistory = async () => {
    if (!activeKey) return;
    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) return;

    const pagination = messagePagination[activeKey];
    if (!pagination || loadingMoreRef.current) return;
    const { page, total } = pagination;
    if (page * PAGE_SIZE >= total) return; // 没有更多

    loadingMoreRef.current = true;
    const nextPage = page + 1;
    try {
      const res = await aiApi.getMessageList(conversationId, {
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      if (res.code === 0 && res.data) {
        const { list = [] } = res.data;
        const olderMessages = toDisplayOrder((list || []) as AIMessage[]);
        if (olderMessages.length === 0) {
          setMessagePagination((prev) => ({
            ...prev,
            [activeKey]: { ...prev[activeKey], page: nextPage },
          }));
          loadingMoreRef.current = false;
          return;
        }

        const scrollEl = messageScrollRef.current;
        const prevScrollHeight = scrollEl?.scrollHeight ?? 0;
        const prevScrollTop = scrollEl?.scrollTop ?? 0;

        setMessages((prev) => {
          const currentMsgs = prev[activeKey] || [];
          return {
            ...prev,
            [activeKey]: [...olderMessages, ...currentMsgs],
          };
        });
        setMessagePagination((prev) => ({
          ...prev,
          [activeKey]: { page: nextPage, total },
        }));

        // 保持滚动位置：新内容在顶部插入，将滚动条下移插入高度
        requestAnimationFrame(() => {
          if (scrollEl) {
            const newScrollHeight = scrollEl.scrollHeight;
            scrollEl.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
          loadingMoreRef.current = false;
        });
      } else {
        loadingMoreRef.current = false;
      }
    } catch (error) {
      console.error("加载更多消息失败:", error);
      loadingMoreRef.current = false;
    }
  };

  // 初始化加载会话列表
  useEffect(() => {
    loadSessions();
  }, []);

  // 当切换会话时加载消息
  useEffect(() => {
    if (activeKey) {
      const conversationId = parseInt(activeKey);
      if (!isNaN(conversationId) && !messages[activeKey]) {
        loadMessages(conversationId);
      }
    }
  }, [activeKey]);

  const currentMessages = messages[activeKey] || [];

  // 新建会话
  const handleAddSession = async () => {
    try {
      const res = await aiApi.createConversation({ title: "新对话" });
      if (res.code === 0 && res.data) {
        const newSession = res.data;
        setSessions([newSession, ...sessions]);
        setMessages((prev) => ({ ...prev, [newSession.ID.toString()]: [] }));
        setMessagePagination((prev) => ({ ...prev, [newSession.ID.toString()]: { page: 0, total: 0 } }));
        setActiveKey(newSession.ID.toString());
      } else {
        antdMessage.error(res.msg || "创建会话失败");
      }
    } catch (error) {
      console.error("创建会话失败:", error);
      antdMessage.error("创建会话失败");
    }
  };

  // 删除会话
  const handleDeleteSession = async (key: string) => {
    const conversationId = parseInt(key);
    if (isNaN(conversationId)) return;

    try {
      const res = await aiApi.deleteConversation(conversationId);
      if (res.code === 0) {
        const newSessions = sessions.filter((s) => s.ID !== conversationId);
        setSessions(newSessions);
        // 删除消息缓存
        setMessages((prev) => {
          const newMessages = { ...prev };
          delete newMessages[key];
          return newMessages;
        });
        setMessagePagination((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });

        // 如果删除的是当前选中的，切换到第一个
        if (activeKey === key) {
          if (newSessions.length > 0) {
            setActiveKey(newSessions[0].ID.toString());
          } else {
            setActiveKey("");
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
  };

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || !activeKey) return;

    const conversationId = parseInt(activeKey);
    if (isNaN(conversationId)) {
      antdMessage.error("会话ID无效");
      return;
    }

    const userContent = inputValue.trim();
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      content: userContent,
      role: "user",
      status: "success",
      timestamp: Date.now(),
    };

    const aiMsgId = `ai-${Date.now()}`;
    let fullText = "";
    const initialAiMsg: Message = {
      id: aiMsgId,
      content: "",
      role: "ai",
      status: "loading",
      timestamp: Date.now(),
    };

    // 一次更新：用户消息 + AI 占位都追加到末尾。顺序：旧在上、新在下（时间正序）
    setMessages((prev) => {
      const currentMsgs = prev[activeKey] || [];
      return {
        ...prev,
        [activeKey]: [...currentMsgs, userMsg, initialAiMsg],
      };
    });

    setInputValue("");
    setLoading(true);

    // 调用后端流式 API
    try {
      await aiApi.chatMessage(
        {
          conversationId,
          content: userContent,
        },
        (chunk: string) => {
          // 在 onmessage 里组装消息：每次收到 chunk 都累加并 setMessages，用 flushSync 强制立即渲染（打字机效果）
          fullText += chunk;
          setMessages((prev) => {
            const currentMsgs = prev[activeKey] || [];
            const aiMsgIndex = currentMsgs.findIndex((msg) => msg.id === aiMsgId);
            if (aiMsgIndex !== -1) {
              const updatedMsgs = currentMsgs.slice();
              updatedMsgs[aiMsgIndex] = {
                ...updatedMsgs[aiMsgIndex],
                content: fullText,
                status: "loading" as const,
              };
              return { ...prev, [activeKey]: updatedMsgs };
            }
            return {
              ...prev,
              [activeKey]: [
                ...currentMsgs,
                {
                  id: aiMsgId,
                  content: fullText,
                  role: "ai",
                  status: "loading",
                  timestamp: Date.now(),
                },
              ],
            };
          });
        },
        (error: Error) => {
          // 错误处理
          console.error("流式请求错误:", error);
          antdMessage.error(error.message || "发送消息失败");
          setMessages((prev) => {
            const currentMsgs = prev[activeKey] || [];
            const aiMsgIndex = currentMsgs.findIndex((msg) => msg.id === aiMsgId);
            if (aiMsgIndex !== -1) {
              const updatedMsgs = [...currentMsgs];
              updatedMsgs[aiMsgIndex] = {
                ...updatedMsgs[aiMsgIndex],
                content: fullText || "发送失败，请重试",
                status: "error" as const,
              };
              return {
                ...prev,
                [activeKey]: updatedMsgs,
              };
            }
            return prev;
          });
          setLoading(false);
        },
        () => {
          // 完成回调
          setMessages((prev) => {
            const currentMsgs = prev[activeKey] || [];
            const aiMsgIndex = currentMsgs.findIndex((msg) => msg.id === aiMsgId);
            if (aiMsgIndex !== -1) {
              const updatedMsgs = [...currentMsgs];
              updatedMsgs[aiMsgIndex] = {
                ...updatedMsgs[aiMsgIndex],
                content: fullText,
                status: "success" as const,
              };
              return {
                ...prev,
                [activeKey]: updatedMsgs,
              };
            }
            return prev;
          });
          setLoading(false);
          // 刷新会话列表以更新最后消息
          loadSessions();
          // 滚动到底部
          setTimeout(() => scrollToBottom(), 0);
        }
      );
    } catch (error) {
      console.error("发送消息失败:", error);
      antdMessage.error("发送消息失败");
      setMessages((prev) => {
        const currentMsgs = prev[activeKey] || [];
        const withoutAi = currentMsgs.filter((msg) => msg.id !== aiMsgId);
        return {
          ...prev,
          [activeKey]: [
            ...withoutAi,
            {
              id: aiMsgId,
              content: "发送失败，请重试",
              role: "ai",
              status: "error",
              timestamp: Date.now(),
            },
          ],
        };
      });
      setLoading(false);
    }
  };

  // Conversations 组件的 items 配置
  const conversationItems: ConversationsProps["items"] = sessions.map((session) => ({
    key: session.ID.toString(),
    label: session.title || "新对话",
    icon: <MessageOutlined />,
    group: "历史记录",
  }));

  // 处理菜单点击
  const handleMenuChange: ConversationsProps["onActiveChange"] = (key) => {
    setActiveKey(key);
  };

  return (
    <Flex style={{ height: "100%" }}>
      <Flex
        vertical
        style={{
          width: 280,
          background: "#f5f5f5",
          borderRight: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        <div style={{ padding: "12px" }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSession} block loading={loadingSessions}>
            新对话
          </Button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {loadingSessions ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#999" }}>加载中...</div>
          ) : (
            <Conversations
              items={conversationItems}
              activeKey={activeKey}
              onActiveChange={handleMenuChange}
              menu={(item) => ({
                items: [
                  {
                    label: "删除会话",
                    key: "delete",
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => handleDeleteSession(item.key),
                  },
                ],
              })}
            />
          )}
        </div>
      </Flex>

      <Flex vertical style={{ background: "#fff", flex: 1 }}>
        {activeKey ? (
          <>
            <div
              ref={messageScrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px",
                height: "calc(100% - 100px)", // 减去底部输入框的高度
              }}
              onScroll={() => {
                const el = messageScrollRef.current;
                if (!el || loadingMoreRef.current) return;
                const pagination = messagePagination[activeKey];
                if (!pagination || pagination.page * PAGE_SIZE >= pagination.total) return;
                // 向上滚动接近顶部时加载更多
                if (el.scrollTop < 80) loadMoreHistory();
              }}
            >
              {(() => {
                const pagination = messagePagination[activeKey];
                const hasMore = pagination && pagination.page * PAGE_SIZE < pagination.total;
                return hasMore ? (
                  <div style={{ textAlign: "center", padding: "8px 0", color: "#999", fontSize: 12 }}>向上滚动加载更多</div>
                ) : null;
              })()}
              {/* currentMessages 为时间正序 [旧…新]，Bubble.List 若为 column-reverse 则需传反序使最新在底部 */}
              <Bubble.List
                items={[...currentMessages].reverse().map((msg) => ({
                  key: msg.id,
                  content: msg.content,
                  role: msg.role,
                  variant: msg.role === "user" ? "shadow" : "filled",
                  placement: msg.role === "user" ? "end" : "start",
                  avatar: (
                    <Avatar
                      icon={msg.role === "user" ? <UserOutlined /> : <MessageOutlined />}
                      style={{
                        backgroundColor: msg.role === "user" ? token.colorInfo : token.colorPrimary,
                      }}
                    />
                  ),
                  // loading: msg.status === "loading",
                }))}
              />
            </div>

            <div
              style={{
                padding: "24px",
                background: "rgba(255, 255, 255, 0.9)",
                backdropFilter: "blur(10px)",
                borderTop: "1px solid rgba(0, 0, 0, 0.06)",
                // 移除绝对定位，使用 Flex 布局
                zIndex: 10,
              }}
            >
              <Sender
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSend}
                loading={loading}
                placeholder="输入消息与 AI 对话..."
              />
            </div>
          </>
        ) : (
          <Flex justify="center" align="center" style={{ height: "100%" }}>
            <Empty description="选择或创建一个新会话开始聊天" />
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};

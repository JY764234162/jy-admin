import React, { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Bubble, Conversations, Sender, type ConversationsProps } from "@ant-design/x";
import { UserOutlined, PlusOutlined, MessageOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Layout, theme, Empty, Flex, Avatar, message as antdMessage, Select } from "antd";
import { aiApi, type AIConversation, type AIMessage } from "@/api/ai";
import MDEditor from "@uiw/react-md-editor";
import { useSelector } from "react-redux";
import { layoutSlice } from "@/store/slice/layout";
import styles from "./index.module.css";
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

  // 定义全局 keyframes（只注入一次）
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("jy-ai-loading-style")) return;
    const style = document.createElement("style");
    style.id = "jy-ai-loading-style";
    style.innerHTML = `
      @keyframes jy-ai-dot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }, []);

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
  // 来自全局布局配置的移动端标记
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);

  // 滚动到底部（仅在特定时机手动调用）
  const scrollToBottom = () => {
    const el = messageScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  // 判断当前是否已经在底部（允许一点误差）
  const isAtBottom = () => {
    const el = messageScrollRef.current;
    if (!el) return false;
    const threshold = 20; // 允许 20px 误差
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
  };

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
        // 首次加载某个会话的消息后，滚动到底部一次
        setTimeout(() => scrollToBottom(), 0);
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

    // 发送消息后默认滚动到底部一次
    setTimeout(() => scrollToBottom(), 0);

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
          // 记录更新前是否在底部
          const wasAtBottom = isAtBottom();

          // 在 onmessage 里组装消息：每次收到分片就累加并更新 UI，具体打字速度由后端控制
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

          // 如果之前在底部，则保持在底部；否则不动
          if (wasAtBottom) {
            requestAnimationFrame(() => scrollToBottom());
          }
        },
        (error: Error) => {
          // 错误处理
          const wasAtBottom = isAtBottom();
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
          if (wasAtBottom) {
            requestAnimationFrame(() => scrollToBottom());
          }
          setLoading(false);
        },
        () => {
          // 完成回调
          const wasAtBottom = isAtBottom();
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
          if (wasAtBottom) {
            requestAnimationFrame(() => scrollToBottom());
          }
          setLoading(false);
          // 刷新会话列表以更新最后消息
          loadSessions();
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
    <Flex style={{ height: "100%", flexDirection: isMobile ? "column" : "row" }}>
      {!isMobile && (
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
      )}

      <Flex vertical style={{ background: "#fff", flex: 1, overflow: "hidden" }}>
        {/* 移动端顶部会话选择器 */}
        {isMobile && (
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
              background: "#fafafa",
            }}
          >
            <Flex gap={8} align="center">
              <Select
                allowClear
                placeholder="选择会话"
                style={{ flex: 1 }}
                loading={loadingSessions}
                value={activeKey || undefined}
                onChange={(val) => {
                  if (!val) {
                    setActiveKey("");
                    return;
                  }
                  handleMenuChange(val);
                }}
                options={sessions.map((s) => ({
                  label: s.title || "新对话",
                  value: s.ID.toString(),
                }))}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddSession}
                loading={loadingSessions}
              />
            </Flex>
          </div>
        )}

        {activeKey ? (
          <>
            <div
              ref={messageScrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                // 移动端顶部有会话选择器，这里减少一点内边距，并去掉固定高度，确保只中间区域滚动
                padding: isMobile ? "12px 12px 12px" : "24px",
                minHeight: 0,
              }}
              onScroll={() => {
                const el = messageScrollRef.current;
                if (!el) return;

                const { scrollTop, scrollHeight, clientHeight } = el;

                // 如果用户已经滚到接近顶部，认为是在浏览历史，关闭自动跟随底部，并触发上拉加载
                if (scrollTop < 80) {
                  if (loadingMoreRef.current) return;
                  const pagination = messagePagination[activeKey];
                  if (!pagination || pagination.page * PAGE_SIZE >= pagination.total) return;
                  loadMoreHistory();
                  return;
                }
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
                  content:
                    loading && !msg.content && msg.role === "ai"
                      ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: "rgba(255, 255, 255, 0.8)",
                                animation: "jy-ai-dot 1s infinite ease-in-out",
                                animationDelay: "0s",
                              }}
                            />
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: "rgba(255, 255, 255, 0.8)",
                                animation: "jy-ai-dot 1s infinite ease-in-out",
                                animationDelay: "0.15s",
                              }}
                            />
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: "rgba(255, 255, 255, 0.8)",
                                animation: "jy-ai-dot 1s infinite ease-in-out",
                                animationDelay: "0.3s",
                              }}
                            />
                          </span>
                          <span style={{ opacity: 0.8, fontSize: 12 }}>AI 正在思考…</span>
                        </span>
                      ) : msg.role === "ai" ? (
                        <div
                          data-color-mode="light"
                          className={styles.markdown}
                          style={{
                            maxWidth: "100%",
                            overflowX: "hidden",
                          }}
                        >
                          <MDEditor.Markdown
                            source={msg.content}
                            style={{
                              background: "transparent",
                              fontSize: 14,
                              maxWidth: "100%",
                              overflowX: "auto",
                              wordBreak: "break-word",
                            }}
                          />
                        </div>
                      ) : (
                        msg.content
                      ),
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
                }))}
              />
            </div>

            <div
              style={{
                padding: isMobile ? "12px 12px 16px" : "24px",
                background: "rgba(255, 255, 255, 0.9)",
                backdropFilter: "blur(10px)",
                borderTop: "1px solid rgba(0, 0, 0, 0.06)",
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

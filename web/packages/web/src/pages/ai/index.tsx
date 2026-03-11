import React, { useState, useEffect, useRef } from "react";
import { Bubble, Conversations, Sender, type ConversationsProps } from "@ant-design/x";
import { UserOutlined, PlusOutlined, MessageOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, theme, Empty, Flex, Avatar, Select } from "antd";
import MDEditor from "@uiw/react-md-editor";
import { useSelector } from "react-redux";
import { layoutSlice } from "@/store/slice/layout";
import styles from "./index.module.css";
import { useAIChat } from "./useAIChat";

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

  const [inputValue, setInputValue] = useState("");

  // 滚动到底部的引用 & 消息列表滚动容器
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const autoScrollRef = useRef(true);
  // 来自全局布局配置的移动端标记
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);

  // 滚动到底部（仅在特定时机手动调用）
  const scrollToBottom = () => {
    const el = messageScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  // 更稳的贴底：等待 DOM 更新后再滚（两次 rAF 规避内容高度延迟变化）
  const scrollToBottomSoon = () => {
    requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(() => scrollToBottom());
    });
  };

  // 判断当前是否已经在底部（允许一点误差）
  const isAtBottom = () => {
    const el = messageScrollRef.current;
    if (!el) return false;
    const threshold = 80; // 允许更大误差，避免“差一点点”导致不跟随
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
  };

  const {
    PAGE_SIZE,
    sessions,
    activeKey,
    setActiveKey,
    currentMessages,
    loading,
    loadingSessions,
    messagePagination,
    loadMoreHistory,
    addSession,
    deleteSession,
    sendMessage,
  } = useAIChat({
    pageSize: 10,
    onAfterMessagesChange: () => {
      // 跟随开关只由 onScroll 决定：
      // - 用户离开底部(autoScroll=false)：更新时不贴底
      // - 用户回到底部(autoScroll=true)：更新时持续贴底
      if (!autoScrollRef.current) return;
      scrollToBottomSoon();
    },
  });

  // 流式输出过程中，内容高度可能在消息更新之后继续变化（Markdown/图片/字体渲染）
  // 用 ResizeObserver 在“需要跟随”时持续贴底，避免偶发不生效
  useEffect(() => {
    const el = messageScrollRef.current;
    if (!el) return;
    if (!("ResizeObserver" in window)) return;

    const ro = new ResizeObserver(() => {
      if (!loading) return;
      if (!autoScrollRef.current) return;
      scrollToBottomSoon();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // 切换会话时：默认开启自动贴底，并滚到最下面（等消息渲染后）
  useEffect(() => {
    if (!activeKey) return;
    autoScrollRef.current = true;
    scrollToBottomSoon();
  }, [activeKey]);

  // 新建会话
  const handleAddSession = async () => {
    await addSession();
  };

  // 删除会话
  const handleDeleteSession = async (key: string) => {
    await deleteSession(key);
  };

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || !activeKey) return;
    const content = inputValue.trim();
    setInputValue("");
    autoScrollRef.current = true; // 主动发送后默认跟随到底部
    await sendMessage(content);
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
    autoScrollRef.current = true;
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

                const { scrollTop } = el;
                const nowAtBottom = isAtBottom();
                autoScrollRef.current = nowAtBottom;

                // 用户手动滚回到底部：立刻贴底并恢复“跟随输出”
                if (nowAtBottom && loading) {
                  scrollToBottomSoon();
                }

                // 如果用户已经滚到接近顶部，认为是在浏览历史，关闭自动跟随底部，并触发上拉加载
                if (scrollTop < 80) {
                  if (loadingMoreRef.current) return;
                  const pagination = messagePagination[activeKey];
                  if (!pagination || pagination.page * PAGE_SIZE >= pagination.total) return;
                  const prevScrollHeight = el.scrollHeight;
                  const prevScrollTop = el.scrollTop;
                  loadingMoreRef.current = true;
                  Promise.resolve(loadMoreHistory()).finally(() => {
                    requestAnimationFrame(() => {
                      const newScrollHeight = el.scrollHeight;
                      el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
                      loadingMoreRef.current = false;
                    });
                  });
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

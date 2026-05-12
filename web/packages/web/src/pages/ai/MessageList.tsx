import { useEffect, useRef } from "react";
import { Bubble } from "@ant-design/x";
import type { UiMessage } from "./types";
import { MessageBubble, MessageAvatar } from "./MessageBubble";

interface MessageListProps {
  messages: UiMessage[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  sessionKey: string;
  isMobile: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  hasMore,
  onLoadMore,
  sessionKey,
  isMobile,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const scrollToBottomSoon = () => {
    requestAnimationFrame(() => {
      scrollToBottom();
      requestAnimationFrame(() => scrollToBottom());
    });
  };

  const isAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return false;
    const threshold = 80;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
  };

  // 切换会话时默认开启自动贴底
  useEffect(() => {
    if (!sessionKey) return;
    autoScrollRef.current = true;
    scrollToBottomSoon();
  }, [sessionKey]);

  // 消息更新或流式输出时，若用户在底部则持续贴底
  useEffect(() => {
    if (loadingMoreRef.current) return;
    if (!autoScrollRef.current) return;
    scrollToBottomSoon();
  }, [messages, loading]);

  // 流式过程中内容高度可能继续变化，用 ResizeObserver 持续贴底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !("ResizeObserver" in window)) return;

    const ro = new ResizeObserver(() => {
      if (!loading) return;
      if (!autoScrollRef.current) return;
      scrollToBottomSoon();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop } = el;
    const nowAtBottom = isAtBottom();
    autoScrollRef.current = nowAtBottom;

    if (nowAtBottom && loading) {
      scrollToBottomSoon();
    }

    // 接近顶部时触发加载更多
    if (scrollTop < 80) {
      if (loadingMoreRef.current) return;
      if (!hasMore) return;

      const prevScrollHeight = el.scrollHeight;
      const prevScrollTop = el.scrollTop;
      loadingMoreRef.current = true;

      Promise.resolve(onLoadMore()).finally(() => {
        requestAnimationFrame(() => {
          const newScrollHeight = el.scrollHeight;
          el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          loadingMoreRef.current = false;
        });
      });
    }
  };

  const bubbleItems = [...messages].reverse().map((msg) => ({
    key: msg.id,
    content: <MessageBubble msg={msg} />,
    role: msg.role,
    variant: msg.role === "user" ? ("shadow" as const) : ("filled" as const),
    placement: msg.role === "user" ? ("end" as const) : ("start" as const),
    avatar: <MessageAvatar role={msg.role} />,
  }));

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: isMobile ? "12px 12px 12px" : "24px",
        minHeight: 0,
      }}
      onScroll={handleScroll}
    >
      {hasMore && (
        <div
          style={{
            textAlign: "center",
            padding: "8px 0",
            color: "#999",
            fontSize: 12,
          }}
        >
          向上滚动加载更多
        </div>
      )}
      <Bubble.List items={bubbleItems} />
    </div>
  );
};

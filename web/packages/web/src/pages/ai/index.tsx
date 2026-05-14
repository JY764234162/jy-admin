import { useCallback } from "react";
import { Flex, Spin } from "antd";
import { useSelector } from "react-redux";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { layoutSlice } from "@/store/slice/layout";
import { useAIChat } from "./useAIChat";
import { ChatSidebar } from "./ChatSidebar";
import { MobileSessionBar } from "./MobileSessionBar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { NewChatWelcome } from "./NewChatWelcome";
import type { ChatMode } from "./types";

function parseConversationId(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const Component = () => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const conversationIdParam = searchParams.get("conversationId");
  const conversationId = parseConversationId(conversationIdParam);

  const chat = useAIChat(conversationId, { pageSize: 10 });

  const sendFromInput = useCallback(
    async (content: string, mode: ChatMode) => chat.sendMessage(content, mode),
    [chat.sendMessage]
  );

  const activeKey = conversationId != null ? String(conversationId) : "";

  const handleSessionRouteChange = (key: string) => {
    if (!key) {
      navigate({ pathname: location.pathname, search: "" }, { replace: true });
      return;
    }
    const id = Number(key);
    if (!Number.isFinite(id)) return;
    chat.navigateToConversation(id);
  };

  const pagination = chat.messagePagination;
  const hasMore = !!pagination && pagination.page * chat.PAGE_SIZE < pagination.total;

  return (
    <Flex style={{ height: "100%", flexDirection: isMobile ? "column" : "row" }}>
      {!isMobile && (
        <ChatSidebar
          sessions={chat.sessions}
          activeKey={activeKey}
          loadingSessions={chat.loadingSessions}
          onActiveChange={handleSessionRouteChange}
          onAddSession={chat.openNewDraft}
          onDeleteSession={chat.deleteSession}
          onRenameSession={chat.renameSession}
        />
      )}

      <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
        {isMobile && (
          <MobileSessionBar
            sessions={chat.sessions}
            activeKey={activeKey}
            loadingSessions={chat.loadingSessions}
            onActiveChange={handleSessionRouteChange}
            onAddSession={chat.openNewDraft}
            onDeleteSession={chat.deleteSession}
            onRenameSession={chat.renameSession}
          />
        )}

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* 不要用 Spin 包住列表：Spin 内部 DOM 不参与 flex 的 min-height 约束，会把列表撑高导致列表内不出现滚动条 */}
          {conversationId != null && chat.messagesLoading && chat.messages.length === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.72)",
                pointerEvents: "none",
              }}
            >
              <Spin size="large" tip="加载消息中…" />
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {conversationId == null ? (
              <NewChatWelcome
                isMobile={isMobile}
                loading={chat.loading}
                onPickPrompt={(text) => sendFromInput(text, "aiserver_chat")}
              />
            ) : (
              <MessageList
                key={activeKey || "__none"}
                messages={chat.messages}
                loading={chat.messagesLoading || chat.loading}
                hasMore={hasMore}
                onLoadMore={chat.loadMoreHistory}
                sessionKey={activeKey}
                isMobile={isMobile}
              />
            )}
          </div>
        </div>
        <ChatInput loading={chat.loading} sendMessage={sendFromInput} />
      </Flex>
    </Flex>
  );
};

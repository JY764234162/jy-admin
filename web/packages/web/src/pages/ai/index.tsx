import { useState } from "react";
import { Flex } from "antd";
import { useSelector } from "react-redux";
import { layoutSlice } from "@/store/slice/layout";
import { useAIChat } from "./useAIChat";
import { ChatSidebar } from "./ChatSidebar";
import { MobileSessionBar } from "./MobileSessionBar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { WelcomeScreen } from "./WelcomeScreen";
import type { ChatMode } from "./types";

export const Component = () => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);

  const [inputValue, setInputValue] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("aiserver_chat");

  const chat = useAIChat({ pageSize: 10 });

  const handleSend = async () => {
    if (!inputValue.trim() || !chat.activeKey) return;
    const content = inputValue.trim();
    setInputValue("");
    await chat.sendMessage(content, chatMode);
  };

  const handlePromptSelect = async (text: string) => {
    const newId = await chat.addSession();
    if (newId) {
      await chat.sendMessage(text, chatMode, newId);
    }
  };

  const pagination = chat.messagePagination[chat.activeKey];
  const hasMore = !!pagination && pagination.page * chat.PAGE_SIZE < pagination.total;

  return (
    <Flex style={{ height: "100%", flexDirection: isMobile ? "column" : "row" }}>
      {!isMobile && (
        <ChatSidebar
          sessions={chat.sessions}
          activeKey={chat.activeKey}
          loadingSessions={chat.loadingSessions}
          onActiveChange={chat.setActiveKey}
          onAddSession={chat.addSession}
          onDeleteSession={chat.deleteSession}
          onRenameSession={chat.renameSession}
        />
      )}

      <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
        {isMobile && (
          <MobileSessionBar
            sessions={chat.sessions}
            activeKey={chat.activeKey}
            loadingSessions={chat.loadingSessions}
            onActiveChange={chat.setActiveKey}
            onAddSession={chat.addSession}
            onRenameSession={chat.renameSession}
          />
        )}

        {chat.activeKey ? (
          <>
            <MessageList
              messages={chat.currentMessages}
              loading={chat.loading}
              hasMore={hasMore}
              onLoadMore={chat.loadMoreHistory}
              sessionKey={chat.activeKey}
              isMobile={isMobile}
            />
            <ChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSend}
              loading={chat.loading}
              mode={chatMode}
              onModeChange={setChatMode}
              isMobile={isMobile}
            />
          </>
        ) : (
          <WelcomeScreen onPromptSelect={handlePromptSelect} />
        )}
      </Flex>
    </Flex>
  );
};

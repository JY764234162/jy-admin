import { useState } from "react";
import { MenuOutlined } from "@ant-design/icons";
import { Button, Drawer, Flex, Typography } from "antd";
import type { AIConversation } from "@/api/aiDirect";
import { ChatSidebar } from "./ChatSidebar";

interface MobileSessionBarProps {
  sessions: AIConversation[];
  activeKey: string;
  loadingSessions: boolean;
  onActiveChange: (key: string) => void;
  onAddSession: () => void;
  onDeleteSession: (key: string) => void;
  onRenameSession: (key: string, newTitle: string) => Promise<boolean>;
}

export const MobileSessionBar: React.FC<MobileSessionBarProps> = ({
  sessions,
  activeKey,
  loadingSessions,
  onActiveChange,
  onAddSession,
  onDeleteSession,
  onRenameSession,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeSession = activeKey ? sessions.find((s) => s.ID.toString() === activeKey) : undefined;
  const titleText = activeKey ? activeSession?.title?.trim() || "新对话" : "新对话";

  const handleActiveChange = (key: string) => {
    onActiveChange(key);
    setDrawerOpen(false);
  };

  const handleAddSession = () => {
    onAddSession();
    setDrawerOpen(false);
  };

  return (
    <>
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
          background: "#fafafa",
        }}
      >
        <Flex align="center" gap={10}>
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 18 }} />}
            onClick={() => setDrawerOpen(true)}
            aria-label="打开历史会话"
          />
          <Typography.Text strong ellipsis style={{ flex: 1, margin: 0, minWidth: 0 }}>
            {titleText}
          </Typography.Text>
        </Flex>
      </div>

      <Drawer
        placement="left"
        width={300}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ header: { display: "none" }, body: { padding: 0 }, footer: { display: "none" } }}
      >
        <div
        className="h-full flex flex-col justify-center items-center"
        >
          <ChatSidebar
            embedded
            sessions={sessions}
            activeKey={activeKey}
            loadingSessions={loadingSessions}
            onActiveChange={handleActiveChange}
            onAddSession={handleAddSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
          />
        </div>
      </Drawer>
    </>
  );
};

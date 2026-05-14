import { Conversations, type ConversationsProps } from "@ant-design/x";
import { MessageOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Input, Modal, Flex } from "antd";
import type { AIConversation } from "@/api/ai";
import { getConversationTimeGroupKey } from "./conversationTimeGroup";

interface ChatSidebarProps {
  sessions: AIConversation[];
  activeKey: string;
  loadingSessions: boolean;
  onActiveChange: (key: string) => void;
  onAddSession: () => void;
  onDeleteSession: (key: string) => void;
  onRenameSession: (key: string, newTitle: string) => Promise<boolean>;
  /** 嵌入抽屉等场景：占满容器宽高，去掉右侧边框 */
  embedded?: boolean;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sessions,
  activeKey,
  loadingSessions,
  onActiveChange,
  onAddSession,
  onDeleteSession,
  onRenameSession,
  embedded = false,
}) => {
  const conversationItems: ConversationsProps["items"] = sessions.map((session) => ({
    key: session.ID.toString(),
    label: session.title || "新对话",
    icon: <MessageOutlined />,
    group: getConversationTimeGroupKey(session),
  }));

  const handleRename = (key: string) => {
    const session = sessions.find((s) => s.ID.toString() === key);
    const initialTitle = session?.title ?? "新对话";
    let nextTitle = initialTitle;

    Modal.confirm({
      title: "重命名会话",
      content: (
        <Input
          defaultValue={initialTitle}
          maxLength={50}
          placeholder="请输入会话名称"
          onChange={(e) => {
            nextTitle = e.target.value;
          }}
        />
      ),
      okText: "保存",
      cancelText: "取消",
      onOk: () => onRenameSession(key, nextTitle),
    });
  };

  return (
    <Flex
      vertical
      style={{
        width: embedded ? "100%" : 280,
        height: embedded ? "100%" : undefined,
        flex: embedded ? 1 : undefined,
        minHeight: embedded ? 0 : undefined,
        background: "#f5f5f5",
        borderRight: embedded ? "none" : "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loadingSessions ? (
          <div style={{ textAlign: "center", padding: 20, color: "#999" }}>加载中...</div>
        ) : (
          <Conversations
            items={conversationItems}
            activeKey={activeKey}
            groupable={{
              label: (group) => String(group).replace(/^\d+-/, ""),
            }}
            creation={{
              onClick: onAddSession,
              label: "新对话",
            }}
            onActiveChange={onActiveChange}
            menu={(item) => ({
              items: [
                {
                  label: "重命名会话",
                  key: "rename",
                  icon: <EditOutlined />,
                  onClick: () => handleRename(item.key),
                },
                {
                  label: "删除会话",
                  key: "delete",
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => onDeleteSession(item.key),
                },
              ],
            })}
          />
        )}
      </div>
    </Flex>
  );
};

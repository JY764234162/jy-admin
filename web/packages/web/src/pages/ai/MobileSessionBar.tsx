import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Select, Flex, Input, Modal } from "antd";
import type { AIConversation } from "@/api/ai";

interface MobileSessionBarProps {
  sessions: AIConversation[];
  activeKey: string;
  loadingSessions: boolean;
  onActiveChange: (key: string) => void;
  onAddSession: () => void;
  onRenameSession: (key: string, newTitle: string) => Promise<boolean>;
}

export const MobileSessionBar: React.FC<MobileSessionBarProps> = ({
  sessions,
  activeKey,
  loadingSessions,
  onActiveChange,
  onAddSession,
  onRenameSession,
}) => {
  const handleRename = () => {
    if (!activeKey) return;
    const session = sessions.find((s) => s.ID.toString() === activeKey);
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
      onOk: () => onRenameSession(activeKey, nextTitle),
    });
  };

  return (
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
              onActiveChange("");
              return;
            }
            onActiveChange(val);
          }}
          options={sessions.map((s) => ({
            label: s.title || "新对话",
            value: s.ID.toString(),
          }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddSession} loading={loadingSessions} />
        <Button icon={<EditOutlined />} onClick={handleRename} disabled={!activeKey} />
      </Flex>
    </div>
  );
};

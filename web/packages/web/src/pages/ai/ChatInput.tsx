import { useState, useRef, useEffect } from "react";
import {
  CloudUploadOutlined,
  LinkOutlined,
  BookOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { Attachments, type AttachmentsProps, Sender } from "@ant-design/x";
import { Badge, Button, Flex, Dropdown, Divider, type MenuProps } from "antd";
import type { ChatMode } from "./types";

const Switch = Sender.Switch;

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  loading: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  isMobile: boolean;
}

const modeOptions: MenuProps["items"] = [
  { key: "aiserver_chat", icon: <MessageOutlined />, label: "基础对话" },
  { key: "aiserver_knowledge", icon: <BookOutlined />, label: "知识库问答" },
];

const modeLabelMap: Record<ChatMode, string> = {
  aiserver_chat: "基础对话",
  aiserver_knowledge: "知识库",
};

export const ChatInput = ({
  value,
  onChange,
  onSubmit,
  loading,
  mode,
  onModeChange,
  isMobile,
}: ChatInputProps) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NonNullable<AttachmentsProps["items"]>>([]);
  const [deepThink, setDeepThink] = useState(false);
  const [useKnowledge, setUseKnowledge] = useState(false);
  const senderRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      items?.forEach((item) => {
        if (item.url?.startsWith("blob:")) {
          URL.revokeObjectURL(item.url);
        }
      });
    };
  }, []);

  const senderHeader = (
    <Sender.Header
      title="附件"
      open={open}
      onOpenChange={setOpen}
      styles={{
        content: {
          padding: 0,
        },
      }}
    >
      <Attachments
        beforeUpload={() => false}
        items={items}
        onChange={({ file, fileList }) => {
          const updatedFileList = fileList.map((item) => {
            if (
              item.uid === file.uid &&
              file.status !== "removed" &&
              item.originFileObj
            ) {
              if (item.url?.startsWith("blob:")) {
                URL.revokeObjectURL(item.url);
              }
              return {
                ...item,
                url: URL.createObjectURL(item.originFileObj),
              };
            }
            return item;
          });
          setItems(updatedFileList);
        }}
        placeholder={(type) =>
          type === "drop"
            ? { title: "拖拽文件到此处" }
            : {
                icon: <CloudUploadOutlined />,
                title: "上传文件",
                description: "点击或拖拽文件到此处",
              }
        }
        getDropContainer={() => senderRef.current?.nativeElement}
      />
    </Sender.Header>
  );

  const handleSubmit = () => {
    if (loading) return;
    if (items.length > 0) {
      console.log("附件列表:", items);
    }
    onSubmit();
    setItems([]);
  };

  const handleModeClick: MenuProps["onClick"] = (e) => {
    onModeChange(e.key as ChatMode);
  };

  return (
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
        ref={senderRef}
        header={senderHeader}
        prefix={
          <Badge dot={items.length > 0 && !open}>
            <Button
              type="text"
              onClick={() => setOpen(!open)}
              icon={<LinkOutlined />}
            />
          </Badge>
        }
        value={value}
        onChange={onChange}
        onSubmit={handleSubmit}
        loading={loading}
        placeholder={
          mode === "aiserver_knowledge"
            ? "输入问题，基于知识库内容回答..."
            : "输入消息与 AI 对话..."
        }
        suffix={false}
        autoSize={{ minRows: 2, maxRows: 6 }}
        footer={(actionNode) => (
          <Flex justify="space-between" align="center">
            <Flex gap="small" align="center">
              <Dropdown
                menu={{
                  selectedKeys: [mode],
                  onClick: handleModeClick,
                  items: modeOptions,
                }}
              >
                <Switch value={false} icon={<MessageOutlined />}>
                  {modeLabelMap[mode]}
                </Switch>
              </Dropdown>
              <Switch
                value={deepThink}
                checkedChildren="深度思考"
                unCheckedChildren="深度思考"
                onChange={setDeepThink}
              />
              <Switch
                value={useKnowledge}
                checkedChildren="知识库"
                unCheckedChildren="知识库"
                onChange={setUseKnowledge}
                icon={<BookOutlined />}
              />
            </Flex>
            <Flex align="center">
              <Divider type="vertical" />
              {actionNode}
            </Flex>
          </Flex>
        )}
      />
    </div>
  );
};

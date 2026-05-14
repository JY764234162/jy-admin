import { BulbOutlined, InfoCircleOutlined, RocketOutlined, SmileOutlined, WarningOutlined } from "@ant-design/icons";
import type { PromptsProps } from "@ant-design/x";
import { Prompts, Welcome } from "@ant-design/x";
import { Avatar, Flex } from "antd";
import agentAvatar from "@/assets/agentAvatar.png";

const promptItems: NonNullable<PromptsProps["items"]> = [
  {
    key: "brainstorm",
    icon: <BulbOutlined style={{ color: "#FAAD14" }} />,
    label: "头脑风暴",
    description: "帮我想 3 个本周可落地的低成本增长实验，并说明各自假设与验证方式。",
  },
  {
    key: "background",
    icon: <InfoCircleOutlined style={{ color: "#1890FF" }} />,
    label: "快速了解背景",
    description: "用通俗语言总结「大语言模型」的核心概念、能力边界和典型应用场景。",
  },
  {
    key: "efficiency",
    icon: <RocketOutlined style={{ color: "#722ED1" }} />,
    label: "提升工作效率",
    description: "我会议和碎片化消息很多，请给出一套可执行的一周节奏安排与沟通模板。",
  },
  {
    key: "relax",
    icon: <SmileOutlined style={{ color: "#52C41A" }} />,
    label: "轻松一下",
    description: "讲一个适合团队晨会破冰的短笑话，要求健康、不冒犯、30 秒内能讲完。",
  },
  {
    key: "troubleshoot",
    icon: <WarningOutlined style={{ color: "#FF4D4F" }} />,
    label: "常见问题排查",
    description: "前端页面白屏时，请按顺序列出从网络、路由、控制台到构建产物的系统化排查步骤。",
  },
];

function pickSendText(data: NonNullable<PromptsProps["items"]>[number]): string {
  const { description, label } = data;
  if (typeof description === "string" && description.trim()) return description.trim();
  if (typeof label === "string" && label.trim()) return label.trim();
  return "";
}

export interface NewChatWelcomeProps {
  /** 点击提示后发送的完整用户消息（与输入框提交一致） */
  onPickPrompt: (text: string) => void | Promise<unknown>;
  loading?: boolean;
  isMobile?: boolean;
}

export function NewChatWelcome({ onPickPrompt, loading = false, isMobile = false }: NewChatWelcomeProps) {
  const handleItemClick: NonNullable<PromptsProps["onItemClick"]> = ({ data }) => {
    if (loading) return;
    const text = pickSendText(data);
    if (!text) return;
    void onPickPrompt(text);
  };

  const outerPadding = isMobile ? "12px 12px 8px" : "24px 16px 16px";
  const innerGap = isMobile ? 16 : 24;
  const contentMaxWidth = isMobile ? "100%" : 720;

  const promptsStyles: NonNullable<PromptsProps["styles"]> = isMobile
    ? {
        root: { width: "100%" },
        title: { marginBlockEnd: 8, fontSize: 13 },
        list: {
          width: "100%",
          alignItems: "stretch",
          overflowX: "visible",
          gap: 10,
        },
        item: {
          width: "100%",
          maxWidth: "100%",
          minHeight: 48,
          paddingBlock: 12,
          paddingInline: 12,
        },
        itemContent: { minWidth: 0, width: "100%" },
      }
    : {
        root: { width: "100%" },
        list: { justifyContent: "center" },
      };

  return (
    <Flex
      vertical
      className="h-full w-full"
      align="center"
      justify="flex-start"
      style={{
        overflow: "auto",
        padding: outerPadding,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Flex vertical align="center" gap={innerGap} style={{ maxWidth: contentMaxWidth, width: "100%" }}>
        <Welcome
          icon={<Avatar src={agentAvatar} size={isMobile ? 48 : 58} />}
          title="你好，我是芳芳"
          description="选一个示例问题开始对话，或在下方输入你的问题"
        />
        <Prompts
          title="试试这些问题"
          vertical={isMobile}
          wrap={!isMobile}
          items={promptItems.map((item) => ({ ...item, disabled: loading }))}
          onItemClick={handleItemClick}
          styles={promptsStyles}
        />
      </Flex>
    </Flex>
  );
}

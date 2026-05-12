import { Welcome, Prompts } from "@ant-design/x";
import { RobotOutlined, BulbOutlined, BookOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Flex } from "antd";

interface WelcomeScreenProps {
  onPromptSelect: (text: string) => void;
}

const promptItems = [
  {
    key: "intro",
    icon: <BulbOutlined />,
    label: "介绍一下自己",
    description: "了解 AI 助手的能力与特点",
  },
  {
    key: "knowledge",
    icon: <BookOutlined />,
    label: "知识库能做什么",
    description: "基于上传的文档进行智能问答",
  },
  {
    key: "code",
    icon: <ThunderboltOutlined />,
    label: "帮我写一段代码",
    description: "生成示例代码或调试建议",
  },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onPromptSelect }) => {
  return (
    <Flex justify="center" align="center" style={{ height: "100%", padding: 24 }}>
      <Welcome
        icon={<RobotOutlined style={{ fontSize: 48 }} />}
        title="欢迎使用 AI 助手"
        description="我是你的智能助手，可以回答问题、提供建议、基于知识库进行问答等。"
        extra={
          <div style={{ marginTop: 24, maxWidth: 600 }}>
            <Prompts
              title="试试这些问题"
              items={promptItems}
              onItemClick={(item) => {
                onPromptSelect((item.data as { label: string }).label);
              }}
            />
          </div>
        }
      />
    </Flex>
  );
};

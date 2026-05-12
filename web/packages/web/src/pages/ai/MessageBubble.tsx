import { UserOutlined, MessageOutlined } from "@ant-design/icons";
import { Avatar, theme } from "antd";
import MDEditor from "@uiw/react-md-editor";
import styles from "./index.module.css";
import type { UiMessage } from "./types";

interface MessageBubbleProps {
  msg: UiMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg }) => {
  const { token } = theme.useToken();

  // AI 正在生成且暂无内容时展示 loading 动画
  if (msg.role === "ai" && msg.status === "loading" && !msg.content) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className={styles.loadingDots}>
          <span className={styles.dot} style={{ animationDelay: "0s" }} />
          <span className={styles.dot} style={{ animationDelay: "0.15s" }} />
          <span className={styles.dot} style={{ animationDelay: "0.3s" }} />
        </span>
        <span style={{ opacity: 0.8, fontSize: 12 }}>AI 正在思考…</span>
      </span>
    );
  }

  // AI 消息使用 Markdown 渲染
  if (msg.role === "ai") {
    return (
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
    );
  }

  // 用户消息纯文本
  return <>{msg.content}</>;
};

export const MessageAvatar: React.FC<{ role: UiMessage["role"] }> = ({ role }) => {
  const { token } = theme.useToken();
  return (
    <Avatar
      icon={role === "user" ? <UserOutlined /> : <MessageOutlined />}
      style={{
        backgroundColor: role === "user" ? token.colorInfo : token.colorPrimary,
      }}
    />
  );
};

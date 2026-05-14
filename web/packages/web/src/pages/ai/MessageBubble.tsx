import { memo } from "react";
import { useSelector } from "react-redux";
import { UserOutlined } from "@ant-design/icons";
import { Avatar } from "antd";
import agentAvatar from "@/assets/agentAvatar.png";
import { getImageUrl } from "@/utils/image";
import { userSlice } from "@/store/slice/user";
import styles from "./index.module.css";
import { StreamingMarkdown } from "./StreamingMarkdown";
import type { UiMessage } from "./types";

interface MessageBubbleProps {
  msg: UiMessage;
}

const MessageBubbleInner: React.FC<MessageBubbleProps> = ({ msg }) => {
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

  // AI 消息：流式期间按块切分 + memo + content-visibility 优化；
  // 结束后整段一次性渲染。具体策略见 StreamingMarkdown。
  if (msg.role === "ai") {
    return (
      <div
        className={styles.markdown}
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "hidden",
          overflowWrap: "anywhere",
        }}
      >
        <StreamingMarkdown
          content={msg.content}
          streaming={msg.status === "loading"}
        />
      </div>
    );
  }

  // 用户消息纯文本
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {msg.content}
    </div>
  );
};

// 只在与渲染相关的字段变化时重渲染，避免历史气泡被无谓 reconcile
export const MessageBubble = memo(
  MessageBubbleInner,
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.content === next.msg.content &&
    prev.msg.status === next.msg.status &&
    prev.msg.role === next.msg.role
);

export const MessageAvatar: React.FC<{ role: UiMessage["role"] }> = ({ role }) => {
  const userInfo = useSelector(userSlice.selectors.getUserInfo);
  const userAvatarUrl = getImageUrl(userInfo?.headerImg);

  if (role === "user") {
    return (
      <Avatar src={userAvatarUrl} icon={!userAvatarUrl ? <UserOutlined /> : undefined} />
    );
  }

  return <Avatar src={agentAvatar} />;
};

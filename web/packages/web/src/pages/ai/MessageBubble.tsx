import { memo, useState } from "react";
import { useSelector } from "react-redux";
import { UserOutlined, BulbOutlined, DownOutlined } from "@ant-design/icons";
import { Avatar, Collapse } from "antd";
import agentAvatar from "@/assets/agentAvatar.png";
import { getImageUrl } from "@/utils/image";
import { userSlice } from "@/store/slice/user";
import styles from "./index.module.css";
import { StreamingMarkdown } from "./StreamingMarkdown";
import type { UiMessage } from "./types";

interface MessageBubbleProps {
  msg: UiMessage;
}

const ThinkingPanel: React.FC<{ msg: UiMessage }> = ({ msg }) => {
  const [expanded, setExpanded] = useState(false);

  if (!msg.thinkingProcess && !msg.thinkingStatus) return null;

  const isProcessing = msg.thinkingStatus === "processing";
  const processes = msg.thinkingProcess?.step?.processes || [];

  if (isProcessing) {
    return (
      <div
        style={{
          marginBottom: 12,
          padding: "10px 14px",
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.85)",
        }}
      >
        <span className={styles.loadingDots}>
          <span className={styles.dot} style={{ animationDelay: "0s", backgroundColor: "rgba(255,255,255,0.6)" }} />
          <span className={styles.dot} style={{ animationDelay: "0.15s", backgroundColor: "rgba(255,255,255,0.6)" }} />
          <span className={styles.dot} style={{ animationDelay: "0.3s", backgroundColor: "rgba(255,255,255,0.6)" }} />
        </span>
        <span>深度思考中…</span>
      </div>
    );
  }

  if (processes.length === 0) return null;

  const thinkingText = processes.map((p) => p.description).filter(Boolean).join("\n\n");
  if (!thinkingText) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <Collapse
        ghost
        bordered={false}
        expandIconPosition="end"
        expandIcon={({ isActive }) => (
          <DownOutlined rotate={isActive ? 180 : 0} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} />
        )}
        activeKey={expanded ? "think" : undefined}
        onChange={(keys) => setExpanded(Array.isArray(keys) ? keys.includes("think") : keys === "think")}
        items={[
          {
            key: "think",
            label: (
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <BulbOutlined style={{ fontSize: 13 }} />
                已深度思考
              </span>
            ),
            children: (
              <div
                style={{
                  padding: "8px 0",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.7)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {thinkingText}
              </div>
            ),
            style: {
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 8,
              padding: "6px 12px",
            },
          },
        ]}
      />
    </div>
  );
};

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
        <ThinkingPanel msg={msg} />
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
    prev.msg.role === next.msg.role &&
    prev.msg.thinkingStatus === next.msg.thinkingStatus &&
    JSON.stringify(prev.msg.thinkingProcess) === JSON.stringify(next.msg.thinkingProcess)
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

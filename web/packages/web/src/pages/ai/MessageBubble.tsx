import { memo, useState } from "react";
import { useSelector } from "react-redux";
import { UserOutlined, BulbOutlined, DownOutlined, FilePdfOutlined, FileTextOutlined, FileExcelOutlined, FileWordOutlined, FileImageOutlined, FileOutlined, DownloadOutlined } from "@ant-design/icons";
import { Avatar, Collapse, Button } from "antd";
import agentAvatar from "@/assets/agentAvatar.png";
import { getImageUrl } from "@/utils/image";
import { userSlice } from "@/store/slice/user";
import styles from "./index.module.css";
import { StreamingMarkdown } from "./StreamingMarkdown";
import type { UiMessage } from "./types";

function getFileTypeIcon(filename: string) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".pdf") return <FilePdfOutlined />;
  if ([".txt", ".md"].includes(ext)) return <FileTextOutlined />;
  if ([".xlsx", ".xls", ".csv"].includes(ext)) return <FileExcelOutlined />;
  if (ext === ".docx") return <FileWordOutlined />;
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext)) return <FileImageOutlined />;
  return <FileOutlined />;
}

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
  const renderLoading = (text: string) => (
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
      <span style={{ opacity: 0.8, fontSize: 12 }}>{text}</span>
    </span>
  );

  // AI 正在生成且暂无内容时展示 loading 动画（优先用 stepStatus）
  if (msg.role === "ai" && msg.status === "loading" && !msg.content) {
    const stepText =
      msg.stepStatus === "retrieving"
        ? "正在检索相关内容…"
        : msg.stepStatus === "generating"
          ? "正在生成答案…"
          : msg.stepStatus === "parsing"
            ? "正在解析文档…"
            : msg.stepStatus === "splitting"
              ? "正在切片…"
              : msg.stepStatus === "embedding"
                ? "正在向量化…"
                : msg.stepStatus === "storing"
                  ? "正在写入向量库…"
                  : "AI 正在思考…";
    return renderLoading(stepText);
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

  // 用户消息纯文本 + 附件列表
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {msg.content}
      {msg.attachments && msg.attachments.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {msg.attachments.map((att) => (
            <div
              key={att.uid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: "rgba(0,0,0,0.04)",
                borderRadius: 6,
                fontSize: 12,
                color: "#444",
                maxWidth: "100%",
              }}
            >
              <span style={{ color: "#1677ff", fontSize: 14 }}>{getFileTypeIcon(att.filename)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {att.filename}
              </span>
              {att.url && (
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = att.url || "";
                    a.download = att.filename;
                    a.click();
                  }}
                  style={{ color: "#1677ff", padding: 0, minWidth: 24 }}
                />
              )}
            </div>
          ))}
        </div>
      )}
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
    prev.msg.stepStatus === next.msg.stepStatus &&
    prev.msg.thinkingStatus === next.msg.thinkingStatus &&
    JSON.stringify(prev.msg.thinkingProcess) === JSON.stringify(next.msg.thinkingProcess) &&
    JSON.stringify(prev.msg.attachments) === JSON.stringify(next.msg.attachments)
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

import { memo } from "react";
import { useSelector } from "react-redux";
import { UserOutlined, FilePdfOutlined, FileTextOutlined, FileExcelOutlined, FileWordOutlined, FileImageOutlined, FileOutlined, DownloadOutlined } from "@ant-design/icons";
import { Avatar, Button } from "antd";
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

  // AI 正在生成且暂无内容时展示 loading 动画
  if (msg.role === "ai" && msg.status === "loading" && !msg.content) {
    return renderLoading("AI 正在思考…");
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

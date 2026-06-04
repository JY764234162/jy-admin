import { memo } from "react";
import { useSelector } from "react-redux";
import { UserOutlined, FilePdfOutlined, FileTextOutlined, FileExcelOutlined, FileWordOutlined, FileImageOutlined, FileOutlined, DownloadOutlined } from "@ant-design/icons";
import { Avatar, Image } from "antd";
import agentAvatar from "@/assets/agentAvatar.png";
import { getImageUrl } from "@/utils/image";
import { userSlice } from "@/store/slice/user";
import styles from "./index.module.css";
import { StreamingMarkdown } from "./StreamingMarkdown";
import type { MessageAttachment, UiMessage } from "./types";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

function isImageAttachment(att: MessageAttachment): boolean {
  const ext = att.file_type?.startsWith(".")
    ? att.file_type.toLowerCase()
    : att.filename.slice(att.filename.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function resolveAttachmentUrl(url: string): string {
  return getImageUrl(url) || url;
}

function downloadAttachment(att: MessageAttachment): void {
  if (!att.url) return;
  const link = document.createElement("a");
  link.href = resolveAttachmentUrl(att.url);
  link.download = att.filename;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  link.click();
}

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

  const imageAttachments = msg.attachments?.filter(isImageAttachment) ?? [];
  const fileAttachments = msg.attachments?.filter((att) => !isImageAttachment(att)) ?? [];

  // 用户消息：附件放在内容前面，图片点击预览，其他文件点击下载
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {(imageAttachments.length > 0 || fileAttachments.length > 0) && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {imageAttachments.length > 0 && (
            <Image.PreviewGroup>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {imageAttachments.map((att) =>
                  att.url ? (
                    <Image
                      key={att.uid}
                      src={resolveAttachmentUrl(att.url)}
                      alt={att.filename}
                      style={{
                        maxWidth: 240,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.08)",
                        cursor: "pointer",
                      }}
                    />
                  ) : null
                )}
              </div>
            </Image.PreviewGroup>
          )}
          {fileAttachments.map((att) => (
            <div
              key={att.uid}
              role={att.url ? "button" : undefined}
              tabIndex={att.url ? 0 : undefined}
              onClick={() => att.url && downloadAttachment(att)}
              onKeyDown={(e) => {
                if (att.url && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  downloadAttachment(att);
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "rgba(0,0,0,0.04)",
                borderRadius: 6,
                fontSize: 13,
                color: "#444",
                maxWidth: "100%",
                cursor: att.url ? "pointer" : "default",
              }}
            >
              <span style={{ color: "#1677ff", fontSize: 16 }}>{getFileTypeIcon(att.filename)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {att.filename}
              </span>
              {att.url && <DownloadOutlined style={{ color: "#1677ff", fontSize: 14, flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}
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

import { useState, useRef, useCallback, type ComponentRef } from "react";
import { useSelector } from "react-redux";
import {
  CloudUploadOutlined,
  LinkOutlined,
  BookOutlined,
  GlobalOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Attachments, type AttachmentsProps, Sender } from "@ant-design/x";
import { Badge, Button, Flex, Divider, Progress, Upload, type UploadProps, type GetProp } from "antd";
import { type UploadAttachmentResponse } from "@/api/aiApi";
import { layoutSlice } from "@/store/slice/layout";
import { localStg } from "@/utils/storage";

const Switch = Sender.Switch;
type FileType = Parameters<GetProp<UploadProps, "beforeUpload">>[0];

const AI_UPLOAD_URL = `${import.meta.env.VITE_AI_SERVER_URL || ""}/api/ai/upload`;
const MAX_FILE_SIZE_MB = 2;

// 聊天附件仅支持图片和 txt
const SUPPORTED_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".txt"]);
const ACCEPT = Array.from(SUPPORTED_EXTS).join(",");

function getFileExt(file: File): string {
  return file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
}

function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTS.has(getFileExt(file));
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isImageName(name: string): boolean {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

type AttachmentItem = NonNullable<AttachmentsProps["items"]>[number];

/** 始终可见的附件缩略图（Attachments 内置进度在 Image hover mask 里，默认看不到） */
function AttachmentThumb({ item, onRemove }: { item: AttachmentItem; onRemove: () => void }) {
  const percent = item.percent ?? 0;
  const isUploading = item.status === "uploading";
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const showImage = isImageName(item.name || "");

  return (
    <div style={{ position: "relative", display: "inline-block", width: 64 }}>
      <div
        style={{
          position: "relative",
          width: 64,
          height: 64,
          borderRadius: 6,
          border: isError ? "1px solid #ff4d4f" : isDone ? "1px solid #52c41a" : "1px solid rgba(0,0,0,0.1)",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: isUploading ? 0.85 : 1,
        }}
      >
        {showImage && item.url ? (
          <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <FileTextOutlined style={{ fontSize: 28, color: "#8c8c8c" }} />
        )}
        {isUploading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 6,
            }}
          >
            <Progress type="circle" percent={percent} size={40} strokeColor="#fff" trailColor="rgba(255,255,255,0.3)" />
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: -4,
          right: -4,
          width: 18,
          height: 18,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDone ? "#52c41a" : isError ? "#ff4d4f" : "transparent",
          fontSize: 10,
          color: "#fff",
        }}
      >
        {isDone && <CheckCircleFilled style={{ fontSize: 16 }} />}
        {isError && <CloseCircleFilled style={{ fontSize: 16 }} />}
      </div>
      <Button
        type="text"
        size="small"
        aria-label="移除附件"
        onClick={onRemove}
        style={{
          position: "absolute",
          top: -4,
          left: -4,
          width: 18,
          height: 18,
          padding: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CloseCircleFilled style={{ fontSize: 16 }} />
      </Button>
    </div>
  );
}

type SendFromInput = (options: {
  content: string;
  useKnowledge?: boolean;
  useSearch?: boolean;
  attachments?: { uid: string; filename: string; url: string; file_type: string }[];
}) => Promise<boolean>;

interface ChatInputProps {
  loading: boolean;
  sendMessage: SendFromInput;
}

export const ChatInput = ({ loading, sendMessage }: ChatInputProps) => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [value, setValue] = useState("");
  const [useKnowledge, setUseKnowledge] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NonNullable<AttachmentsProps["items"]>>([]);
  const senderRef = useRef<ComponentRef<typeof Sender>>(null);
  const attachmentsRef = useRef<ComponentRef<typeof Attachments>>(null);

  /** 选中即上传；必须用 XHR（fetch 没有 upload.onprogress，无法显示上传进度） */
  const customRequest = useCallback<NonNullable<UploadProps["customRequest"]>>(({ file, onSuccess, onError, onProgress }) => {
    const fileObj = file as File;
    onProgress?.({ percent: 0 });

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", fileObj);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
        onProgress?.({ percent: pct });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as {
            code: number;
            data?: UploadAttachmentResponse;
            msg?: string;
          };
          if (res.code === 0 && res.data) {
            onProgress?.({ percent: 100 });
            onSuccess?.(res.data);
            return;
          }
          const err = new Error(res.msg || "上传失败");
          window.$message?.error(err.message);
          onError?.(err);
        } catch {
          const err = new Error("解析响应失败");
          window.$message?.error(err.message);
          onError?.(err);
        }
        return;
      }
      const err = new Error(`HTTP ${xhr.status}`);
      window.$message?.error(err.message);
      onError?.(err);
    };

    xhr.onerror = () => {
      const err = new Error("网络错误");
      window.$message?.error(err.message);
      onError?.(err);
    };

    xhr.open("POST", AI_UPLOAD_URL);
    const token = localStg.get("token") || "";
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(formData);
  }, []);

  const beforeUpload = useCallback((file: FileType) => {
    if (file.size === 0) {
      window.$message?.error("文件不能为空，请检查文件内容后重新上传");
      return Upload.LIST_IGNORE;
    }
    if (!isSupportedFile(file)) {
      window.$message?.error(`不支持的文件格式 ${getFileExt(file)}，目前仅支持：${Array.from(SUPPORTED_EXTS).join("、")}`);
      return Upload.LIST_IGNORE;
    }
    if (file.size / 1024 / 1024 >= MAX_FILE_SIZE_MB) {
      window.$message?.error(`文件不大于 ${MAX_FILE_SIZE_MB}MB`);
      return Upload.LIST_IGNORE;
    }
    return true;
  }, []);

  const handleAttachmentChange: AttachmentsProps["onChange"] = ({ file, fileList }) => {
    if (file.status === "removed") {
      const removed = items.find((it) => it.uid === file.uid);
      if (removed?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(removed.url);
      }
      setItems(fileList);
      return;
    }

    const updated = fileList.map((item) => {
      if (item.uid !== file.uid || file.status === "removed" || !item.originFileObj) {
        return item;
      }
      const origin = item.originFileObj as File;
      if (!isImageName(origin.name)) {
        return item;
      }
      if (item.url?.startsWith("blob:")) {
        URL.revokeObjectURL(item.url);
      }
      return { ...item, url: URL.createObjectURL(origin) };
    });
    setItems(updated);
  };

  const handleRemoveAttachment = (uid: string) => {
    const target = items.find((it) => it.uid === uid);
    if (target?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(target.url);
    }
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  };

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
      <div style={{ padding: items.length > 0 ? "12px 12px 0" : 0 }}>
        {items.length > 0 && (
          <Flex gap={16} wrap align="flex-start" style={{ marginBottom: 8 }}>
            {items.map((item) => (
              <AttachmentThumb key={item.uid} item={item} onRemove={() => handleRemoveAttachment(item.uid)} />
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              aria-label="继续添加附件"
              onClick={() => attachmentsRef.current?.select({ accept: ACCEPT, multiple: true })}
              style={{ width: 64, height: 64 }}
            />
          </Flex>
        )}
        <Attachments
          ref={attachmentsRef}
          accept={ACCEPT}
          beforeUpload={beforeUpload}
          customRequest={customRequest}
          items={items}
          onChange={handleAttachmentChange}
          styles={items.length > 0 ? { list: { display: "none" } } : undefined}
          placeholder={(type) =>
            type === "drop"
              ? { title: "拖拽文件到此处" }
              : {
                  icon: <CloudUploadOutlined />,
                  title: "上传文件",
                  description: `支持 ${Array.from(SUPPORTED_EXTS).join("、")} 格式，单个不超过 ${MAX_FILE_SIZE_MB}MB`,
                }
          }
          getDropContainer={() => senderRef.current?.nativeElement}
        />
      </div>
    </Sender.Header>
  );

  const handleSubmit = async () => {
    if (loading) return;
    const text = value.trim();
    if (!text) return;

    if (items.some((it) => it.status === "uploading")) {
      window.$message?.warning("文件上传中，请稍候");
      return;
    }

    const failedCount = items.filter((it) => it.status === "error").length;
    if (failedCount > 0) {
      window.$message?.error(`${failedCount} 个文件上传失败，请移除后重试`);
      return;
    }

    const attachments = items
      .filter((it) => it.status === "done" && it.response)
      .map((it) => {
        const res = it.response as UploadAttachmentResponse;
        return {
          uid: it.uid,
          filename: res.filename || it.name || "未知文件",
          url: res.url,
          file_type: res.file_type,
        };
      });

    const ok = await sendMessage({
      content: text,
      useKnowledge,
      useSearch,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    if (ok) {
      setValue("");
      items.forEach((it) => {
        if (it.url?.startsWith("blob:")) {
          URL.revokeObjectURL(it.url);
        }
      });
      setItems([]);
    }
  };

  const handleKnowledgeChange = (checked: boolean) => {
    setUseKnowledge(checked);
  };

  const handleSearchChange = (checked: boolean) => {
    setUseSearch(checked);
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
            <Button type="text" onClick={() => setOpen(!open)} icon={<LinkOutlined />} />
          </Badge>
        }
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        loading={loading}
        placeholder={
          items.length > 0
            ? "提问与已上传文件相关的问题..."
            : useKnowledge
              ? "输入问题，基于知识库内容回答..."
              : useSearch
                ? "输入问题，联网搜索最新信息..."
                : "输入消息与 AI 对话..."
        }
        suffix={false}
        autoSize={{ minRows: 2, maxRows: 6 }}
        footer={(actionNode) => (
          <Flex justify="space-between" align="center">
            <Flex gap="small" align="center">
              <Switch
                value={useKnowledge}
                checkedChildren="知识库"
                unCheckedChildren="知识库"
                onChange={handleKnowledgeChange}
                icon={<BookOutlined />}
              />
              <Switch
                value={useSearch}
                checkedChildren="联网搜索"
                unCheckedChildren="联网搜索"
                onChange={handleSearchChange}
                icon={<GlobalOutlined />}
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

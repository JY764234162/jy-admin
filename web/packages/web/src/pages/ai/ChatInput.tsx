import { useState, useRef, useEffect, type ComponentRef } from "react";
import { useSelector } from "react-redux";
import {
  CloudUploadOutlined,
  LinkOutlined,
  BookOutlined,
  GlobalOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
} from "@ant-design/icons";
import { Attachments, type AttachmentsProps, Sender } from "@ant-design/x";
import { Badge, Button, Flex, Divider, Progress, message as antdMessage } from "antd";
import { layoutSlice } from "@/store/slice/layout";
import { aiServerApi } from "@/api/aiApi";
const Switch = Sender.Switch;

const SUPPORTED_DOC_EXTS = new Set([".pdf", ".txt", ".md", ".docx", ".xlsx", ".xls", ".csv"]);
const SUPPORTED_IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const SUPPORTED_EXTS = new Set([...SUPPORTED_DOC_EXTS, ...SUPPORTED_IMG_EXTS]);

function getFileExt(file: File): string {
  return file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
}

function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTS.has(getFileExt(file));
}

function isImageFile(file: File): boolean {
  return SUPPORTED_IMG_EXTS.has(getFileExt(file));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result 是 data:image/jpeg;base64,/9j/4AAQ... 格式
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type SendFromInput = (options: {
  content: string;
  useKnowledge?: boolean;
  useSearch?: boolean;
  imageBase64?: string;
  attachments?: { uid: string; filename: string }[];
}) => Promise<boolean>;

interface ChatInputProps {
  loading: boolean;
  sendMessage: SendFromInput;
}

/** 单文件上传状态 */
interface UploadingFile {
  uid: string;
  filename: string;
  stage: "uploading" | "completed" | "failed";
  message: string;
  progress: number;
  docId?: string;
  cosUrl?: string;
  error?: string;
}

const STAGE_LABEL: Record<UploadingFile["stage"], string> = {
  uploading: "正在上传解析",
  completed: "已就绪",
  failed: "失败",
};

export const ChatInput = ({ loading, sendMessage }: ChatInputProps) => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [value, setValue] = useState("");
  const [useKnowledge, setUseKnowledge] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NonNullable<AttachmentsProps["items"]>>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const senderRef = useRef<ComponentRef<typeof Sender>>(null);

  useEffect(() => {
    return () => {
      items?.forEach((item) => {
        if (item.url?.startsWith("blob:")) {
          URL.revokeObjectURL(item.url);
        }
      });
    };
  }, []);

  /** 上传单个文件（同步），返回 doc_id（失败抛错） */
  const uploadFileWithProgress = async (uid: string, file: File): Promise<string> => {
    setUploadingFiles((prev) => [
      ...prev.filter((f) => f.uid !== uid),
      { uid, filename: file.name, stage: "uploading", message: "正在上传解析...", progress: 0 },
    ]);

    try {
      const res = await aiServerApi.uploadKnowledge(file);
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.uid === uid
            ? { ...f, stage: "completed", message: "已就绪", progress: 100, docId: res.knowledge_id, cosUrl: res.cos_url }
            : f
        )
      );
      return res.knowledge_id;
    } catch (e: any) {
      const errMsg = e?.message || "上传失败";
      setUploadingFiles((prev) => prev.map((f) => (f.uid === uid ? { ...f, stage: "failed", message: errMsg, error: errMsg, progress: 0 } : f)));
      throw e;
    }
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
      <Attachments
        beforeUpload={() => false}
        items={items}
        onChange={({ file, fileList }) => {
          // 新增文件时先做格式校验和空文件拦截
          if (file.status !== "removed" && file.originFileObj) {
            if (file.originFileObj.size === 0) {
              antdMessage.error("文件不能为空，请检查文件内容后重新上传");
              const filtered = fileList.filter((it) => it.uid !== file.uid);
              setItems(filtered);
              return;
            }
            if (!isSupportedFile(file.originFileObj)) {
              const ext = file.originFileObj.name.slice(file.originFileObj.name.lastIndexOf(".")).toLowerCase();
              antdMessage.error(`不支持的文件格式 ${ext}，目前仅支持：${Array.from(SUPPORTED_EXTS).join("、")}`);
              const filtered = fileList.filter((it) => it.uid !== file.uid);
              setItems(filtered);
              return;
            }
          }
          const updatedFileList = fileList.map((item) => {
            if (item.uid === file.uid && file.status !== "removed" && item.originFileObj) {
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

          // 新增文件时立即开始上传解析（不等点击发送）
          if (file.status !== "removed" && file.originFileObj) {
            const alreadyStarted = uploadingFiles.some((u) => u.uid === file.uid);
            if (!alreadyStarted) {
              uploadFileWithProgress(file.uid, file.originFileObj).catch(() => {
                // 错误已在 uploadFileWithProgress 内部处理到 uploadingFiles 状态
              });
            }
          }

          // 文件被移除时同步清理上传状态
          if (file.status === "removed") {
            setUploadingFiles((prev) => prev.filter((f) => f.uid !== file.uid));
          }
        }}
        placeholder={(type) =>
          type === "drop"
            ? { title: "拖拽文件到此处" }
            : {
                icon: <CloudUploadOutlined />,
                title: "上传文件",
                description: `支持 ${Array.from(SUPPORTED_EXTS).join("、")} 格式`,
              }
        }
        getDropContainer={() => senderRef.current?.nativeElement}
      />
    </Sender.Header>
  );

  const handleSubmit = async () => {
    if (loading) return;
    const text = value.trim();
    if (!text) return;

    // 分离图片和文档
    const imageItems = items.filter((it) => it.originFileObj && isImageFile(it.originFileObj));
    const docItems = items.filter((it) => it.originFileObj && !isImageFile(it.originFileObj));

    // 处理图片附件（转成 base64）
    let imageBase64: string | undefined;
    if (imageItems.length > 0) {
      const firstImage = imageItems[0]!.originFileObj as File;
      try {
        imageBase64 = await fileToBase64(firstImage);
      } catch (e: any) {
        antdMessage.error(`图片处理失败：${e?.message || e}`);
        return;
      }
    }

    // 处理文档附件：先解析（向量化）
    if (docItems.length > 0) {
      const failedDocs = docItems.filter((it) => {
        const cur = uploadingFiles.find((u) => u.uid === it.uid);
        return cur?.stage === "failed";
      });
      if (failedDocs.length > 0) {
        antdMessage.error(`${failedDocs.length} 个文件解析失败，请移除失败文件后重试`);
        return;
      }

      const pending = docItems.filter((it) => {
        const cur = uploadingFiles.find((u) => u.uid === it.uid);
        return !cur || (cur.stage !== "completed" && cur.stage !== "failed");
      });

      try {
        for (const it of pending) {
          const fileObj = it.originFileObj as File | undefined;
          if (!fileObj) continue;
          await uploadFileWithProgress(it.uid, fileObj);
        }
      } catch (e: any) {
        antdMessage.error(`文件解析失败：${e?.message || e}`);
        return;
      }

      const stillFailed = docItems.filter((it) => {
        const cur = uploadingFiles.find((u) => u.uid === it.uid);
        return cur?.stage === "failed";
      });
      if (stillFailed.length > 0) {
        antdMessage.error(`${stillFailed.length} 个文件解析失败，请移除后重试`);
        return;
      }
    }

    // 合并所有附件元数据
    const attachments = items.map((it) => {
      const uploadInfo = uploadingFiles.find((u) => u.uid === it.uid);
      return {
        uid: it.uid,
        filename: it.originFileObj?.name || "未知文件",
        url: uploadInfo?.cosUrl || it.url || "",
      };
    });

    // 统一发送（chat 接口已支持图片识别）
    const ok = await sendMessage({
      content: text,
      useKnowledge,
      useSearch,
      imageBase64,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    if (ok) {
      setValue("");
      items.forEach((it) => {
        if (it.url?.startsWith("blob:")) URL.revokeObjectURL(it.url);
      });
      setItems([]);
      setUploadingFiles([]);
    }
  };

  const handleKnowledgeChange = (checked: boolean) => {
    setUseKnowledge(checked);
  };

  const handleSearchChange = (checked: boolean) => {
    setUseSearch(checked);
  };

  const renderUploadProgressList = () => {
    if (uploadingFiles.length === 0) return null;
    return (
      <div
        style={{
          marginBottom: 8,
          padding: "10px 12px",
          background: "rgba(0, 122, 255, 0.06)",
          border: "1px solid rgba(0, 122, 255, 0.15)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {uploadingFiles.map((f) => {
          const isDone = f.stage === "completed";
          const isFailed = f.stage === "failed";
          return (
            <div key={f.uid} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Flex align="center" gap="small" style={{ fontSize: 12 }}>
                {isDone ? (
                  <CheckCircleFilled style={{ color: "#52c41a" }} />
                ) : isFailed ? (
                  <CloseCircleFilled style={{ color: "#ff4d4f" }} />
                ) : (
                  <LoadingOutlined style={{ color: "#1677ff" }} />
                )}
                <span style={{ flex: 1, fontWeight: 500, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename}</span>
                <span style={{ color: isFailed ? "#ff4d4f" : "#666" }}>
                  {STAGE_LABEL[f.stage]}
                  {!isDone && !isFailed && f.progress > 0 ? `（${f.progress}%）` : ""}
                </span>
              </Flex>
              {!isFailed && (
                <Progress
                  percent={f.progress}
                  size="small"
                  showInfo={false}
                  status={isDone ? "success" : "active"}
                  strokeColor={isDone ? "#52c41a" : "#1677ff"}
                />
              )}
              {!isDone && !isFailed && (
                <div style={{ fontSize: 11, color: "#888" }}>{f.message}</div>
              )}
              {isFailed && f.error && (
                <div style={{ fontSize: 11, color: "#ff4d4f" }}>{f.error}</div>
              )}
            </div>
          );
        })}
      </div>
    );
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
      {renderUploadProgressList()}
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

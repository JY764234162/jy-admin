import { useState, useRef, useEffect, type ComponentRef } from "react";
import { useSelector } from "react-redux";
import {
  CloudUploadOutlined,
  LinkOutlined,
  BookOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
} from "@ant-design/icons";
import { Attachments, type AttachmentsProps, Sender } from "@ant-design/x";
import { Badge, Button, Flex, Divider, Progress, message as antdMessage } from "antd";
import { layoutSlice } from "@/store/slice/layout";
import { aiServerApi, type KnowledgeProgressEvent } from "@/api/aiDirect";
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
  deepThink?: boolean;
  imageBase64?: string;
  docIds?: string[];
  attachments?: { uid: string; filename: string }[];
}) => Promise<boolean>;

interface ChatInputProps {
  loading: boolean;
  sendMessage: SendFromInput;
}

/** 单文件上传/解析状态 */
interface UploadingFile {
  uid: string;
  filename: string;
  taskId?: string;
  stage: KnowledgeProgressEvent["stage"];
  message: string;
  progress: number;
  docId?: string;
  cosUrl?: string;
  error?: string;
}

const STAGE_LABEL: Record<UploadingFile["stage"], string> = {
  pending: "等待处理",
  parsing: "正在解析文档",
  splitting: "正在切片",
  embedding: "正在向量化",
  storing: "正在写入向量库",
  completed: "已就绪",
  failed: "失败",
};

export const ChatInput = ({ loading, sendMessage }: ChatInputProps) => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [value, setValue] = useState("");
  const [useKnowledge, setUseKnowledge] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NonNullable<AttachmentsProps["items"]>>([]);
  const [deepThink, setDeepThink] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const senderRef = useRef<ComponentRef<typeof Sender>>(null);
  const abortMapRef = useRef<Map<string, { abort: () => void }>>(new Map());

  useEffect(() => {
    return () => {
      items?.forEach((item) => {
        if (item.url?.startsWith("blob:")) {
          URL.revokeObjectURL(item.url);
        }
      });
      abortMapRef.current.forEach((a) => a.abort());
      abortMapRef.current.clear();
    };
  }, []);

  /** 上传单个文件并监听解析进度，返回 doc_id（失败抛错） */
  const uploadFileWithProgress = async (uid: string, file: File): Promise<string> => {
    setUploadingFiles((prev) => [
      ...prev.filter((f) => f.uid !== uid),
      { uid, filename: file.name, stage: "pending", message: "准备上传...", progress: 0 },
    ]);

    let taskId: string;
    let cosUrl: string | undefined;
    try {
      const res = await aiServerApi.uploadKnowledgeStream(file);
      taskId = res.task_id;
      cosUrl = res.cos_url;
    } catch (e: any) {
      const errMsg = e?.message || "上传失败";
      setUploadingFiles((prev) => prev.map((f) => (f.uid === uid ? { ...f, stage: "failed", message: errMsg, error: errMsg, progress: 0 } : f)));
      throw e;
    }
    setUploadingFiles((prev) => prev.map((f) => (f.uid === uid ? { ...f, taskId, cosUrl, stage: "parsing", message: "开始解析...", progress: 2 } : f)));

    return new Promise<string>((resolve, reject) => {
      const sub = aiServerApi.subscribeKnowledgeProgress(
        taskId,
        (evt) => {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.uid === uid
                ? {
                    ...f,
                    stage: evt.stage,
                    message: evt.message,
                    progress: evt.progress,
                    docId: evt.doc_id || f.docId,
                    error: evt.error,
                  }
                : f
            )
          );
          if (evt.stage === "completed" && evt.doc_id) {
            abortMapRef.current.delete(uid);
            resolve(evt.doc_id);
          } else if (evt.stage === "failed") {
            abortMapRef.current.delete(uid);
            reject(new Error(evt.error || evt.message || "解析失败"));
          }
        },
        (err) => {
          abortMapRef.current.delete(uid);
          setUploadingFiles((prev) => prev.map((f) => (f.uid === uid ? { ...f, stage: "failed", message: err.message, error: err.message } : f)));
          reject(err);
        }
      );
      abortMapRef.current.set(uid, sub);
    });
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

          // 文件被移除时同步清理上传状态和订阅
          if (file.status === "removed") {
            const sub = abortMapRef.current.get(file.uid);
            sub?.abort();
            abortMapRef.current.delete(file.uid);
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

    // 有图片附件：走多模态 vision 模式
    if (imageItems.length > 0) {
      const firstImage = imageItems[0]!.originFileObj as File;
      try {
        const base64 = await fileToBase64(firstImage);
        const imgAttachments = imageItems.map((it) => ({
          uid: it.uid,
          filename: it.originFileObj?.name || "未知图片",
          url: it.url || "",
        }));
        const ok = await sendMessage({
          content: text,
          deepThink,
          imageBase64: base64,
          attachments: imgAttachments,
        });
        if (ok) {
          setValue("");
          items.forEach((it) => {
            if (it.url?.startsWith("blob:")) URL.revokeObjectURL(it.url);
          });
          setItems([]);
          setUploadingFiles([]);
        }
      } catch (e: any) {
        antdMessage.error(`图片处理失败：${e?.message || e}`);
      }
      return;
    }

    // 有文档附件：先解析（向量化），再进入附件问答（仅基于刚上传的文件回答，与知识库开关无关）
    if (docItems.length > 0) {
      // 检查是否有已失败的文件，有则提示并阻止发送
      const failedDocs = docItems.filter((it) => {
        const cur = uploadingFiles.find((u) => u.uid === it.uid);
        return cur?.stage === "failed";
      });
      if (failedDocs.length > 0) {
        antdMessage.error(`${failedDocs.length} 个文件解析失败，请移除失败文件后重试`);
        return;
      }

      // 只上传尚未完成的文件（已完成或失败的不重试）
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

      // 上传完成后再次检查是否全部成功
      const stillFailed = docItems.filter((it) => {
        const cur = uploadingFiles.find((u) => u.uid === it.uid);
        return cur?.stage === "failed";
      });
      if (stillFailed.length > 0) {
        antdMessage.error(`${stillFailed.length} 个文件解析失败，请移除后重试`);
        return;
      }

      // 收集本次已成功向量化的 doc_id，传给后端做精确检索
      const docIds = docItems
        .map((it) => uploadingFiles.find((u) => u.uid === it.uid)?.docId)
        .filter((id): id is string => !!id);

      const attachments = docItems.map((it) => {
        const uploadInfo = uploadingFiles.find((u) => u.uid === it.uid);
        return {
          uid: it.uid,
          filename: it.originFileObj?.name || "未知文件",
          url: uploadInfo?.cosUrl || it.url || "",
        };
      });

      // 附件和知识库开关独立：勾选了知识库就走 knowledge（会混合检索附件+知识库），否则只检索附件
      const ok = await sendMessage({
        content: text,
        useKnowledge,
        deepThink,
        docIds,
        attachments,
      });
      if (ok) {
        setValue("");
        items.forEach((it) => {
          if (it.url?.startsWith("blob:")) URL.revokeObjectURL(it.url);
        });
        setItems([]);
        setUploadingFiles([]);
      }
      return;
    }

    // 无附件：正常聊天
    const ok = await sendMessage({ content: text, useKnowledge, deepThink });
    if (ok) {
      setValue("");
    }
    setItems([]);
  };

  const handleKnowledgeChange = (checked: boolean) => {
    setUseKnowledge(checked);
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
              : "输入消息与 AI 对话..."
        }
        suffix={false}
        autoSize={{ minRows: 2, maxRows: 6 }}
        footer={(actionNode) => (
          <Flex justify="space-between" align="center">
            <Flex gap="small" align="center">
              <Switch value={deepThink} checkedChildren="深度思考" unCheckedChildren="深度思考" onChange={setDeepThink} />
              <Switch
                value={useKnowledge}
                checkedChildren="知识库"
                unCheckedChildren="知识库"
                onChange={handleKnowledgeChange}
                icon={<BookOutlined />}
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

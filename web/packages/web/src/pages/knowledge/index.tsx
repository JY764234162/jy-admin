import { useState, useEffect, useRef } from "react";
import {
  Table, Button, Space, Popconfirm, Card, Upload, Flex, Tag,
  Input, Divider, Empty, Spin, message as antdMessage
} from "antd";
import {
  UploadOutlined, DeleteOutlined, FileTextOutlined, BookOutlined,
  FilePdfOutlined, FileWordOutlined, FileExcelOutlined,
  EyeOutlined, DownloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { aiServerApi, type KnowledgeDocument } from "@/api/aiServer";
import { aiChatStreamClient } from "@/workers/aiChatStreamClient";

export const Component = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 问答测试
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [querying, setQuerying] = useState(false);
  const currentStreamUnsubRef = useRef<null | (() => void)>(null);
  const currentStreamIdRef = useRef<string | null>(null);

  // 加载文档列表
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await aiServerApi.getKnowledgeList();
      setDocuments(res.documents || []);
    } catch (error: any) {
      console.error("获取知识库列表失败:", error);
      antdMessage.error(error.message || "获取知识库列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // 上传文档
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await aiServerApi.uploadKnowledge(file);
      antdMessage.success(`文档「${res.filename}」上传成功，共 ${res.chunks} 个片段`);
      fetchDocuments();
    } catch (error: any) {
      console.error("上传失败:", error);
      antdMessage.error(error.message || "文档上传失败");
    } finally {
      setUploading(false);
    }
    return false;
  };

  // 根据文件类型返回对应图标和颜色
  const getFileIcon = (fileType?: string) => {
    const ext = (fileType || "").toLowerCase();
    switch (ext) {
      case ".pdf":
        return <FilePdfOutlined style={{ color: "#ff4d4f", fontSize: 18 }} />;
      case ".docx":
      case ".doc":
        return <FileWordOutlined style={{ color: "#1890ff", fontSize: 18 }} />;
      case ".xlsx":
      case ".xls":
      case ".csv":
        return <FileExcelOutlined style={{ color: "#52c41a", fontSize: 18 }} />;
      case ".txt":
      case ".md":
      default:
        return <FileTextOutlined style={{ color: "#8c8c8c", fontSize: 18 }} />;
    }
  };

  // 预览文档
  const handlePreview = (record: KnowledgeDocument) => {
    if (!record.cos_url) {
      antdMessage.warning("文件地址不可用");
      return;
    }
    const ext = (record.file_type || "").toLowerCase();
    if (ext === ".pdf") {
      window.open(record.cos_url, "_blank");
    } else {
      antdMessage.info("该格式暂不支持预览，已为您下载");
      window.open(record.cos_url, "_blank");
    }
  };

  // 下载文档
  const handleDownload = (record: KnowledgeDocument) => {
    if (!record.cos_url) {
      antdMessage.warning("文件地址不可用");
      return;
    }
    window.open(record.cos_url, "_blank");
  };

  // 删除文档
  const handleDelete = async (docId: string) => {
    try {
      await aiServerApi.deleteKnowledge(docId);
      antdMessage.success("删除成功");
      fetchDocuments();
    } catch (error: any) {
      console.error("删除失败:", error);
      antdMessage.error(error.message || "删除失败");
    }
  };

  // 知识库问答测试
  const handleQuery = async () => {
    if (!question.trim()) return;
    if (querying) return;

    const content = question.trim();
    setAnswer("");
    setQuerying(true);

    // 使用固定 conversationId = 0 作为问答测试会话
    const conversationId = 0;
    const streamId = aiChatStreamClient.start(conversationId, content, "aiserver_knowledge");
    currentStreamIdRef.current = streamId;

    const unsub = aiChatStreamClient.subscribe(conversationId, (snap) => {
      setAnswer(snap.fullText);
      if (snap.status === "done" || snap.status === "error") {
        setQuerying(false);
        unsub();
      }
    });
    currentStreamUnsubRef.current = unsub;
  };

  // 页面卸载时清理
  useEffect(() => {
    return () => {
      currentStreamUnsubRef.current?.();
      if (currentStreamIdRef.current) {
        aiChatStreamClient.stop(currentStreamIdRef.current);
      }
    };
  }, []);

  const columns: ColumnsType<KnowledgeDocument> = [
    {
      title: "文档名称",
      dataIndex: "source",
      key: "source",
      render: (text: string, record: KnowledgeDocument) => (
        <Space>
          {getFileIcon(record.file_type)}
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: "文档ID",
      dataIndex: "doc_id",
      key: "doc_id",
      render: (id: string) => <Tag color="blue">{id}</Tag>,
    },
    {
      title: "片段数",
      dataIndex: "chunk_count",
      key: "chunk_count",
      width: 100,
      render: (count: number) => <Tag color="green">{count} 段</Tag>,
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      render: (_: any, record: KnowledgeDocument) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
          >
            预览
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record)}
          >
            下载
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除文档「${record.source}」吗？`}
            onConfirm={() => handleDelete(record.doc_id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={16} style={{ padding: 16, height: "100%", overflow: "auto" }}>
      {/* 文档上传 */}
      <Card
        title={
          <Space>
            <BookOutlined />
            <span>知识库文档管理</span>
          </Space>
        }
        extra={
          <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt,.md,.pdf,.docx,.xlsx,.csv">
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传文档
            </Button>
          </Upload>
        }
      >
        <Table
          rowKey="doc_id"
          columns={columns}
          dataSource={documents}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无文档，请上传" /> }}
        />
      </Card>

      <Divider />

      {/* 知识库问答测试 */}
      <Card
        title={
          <Space>
            <span>知识库问答测试</span>
            {querying && <Spin size="small" />}
          </Space>
        }
      >
        <Flex gap={8}>
          <Input.TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="输入问题，基于知识库内容进行问答..."
            rows={2}
            disabled={querying}
          />
          <Button
            type="primary"
            onClick={handleQuery}
            loading={querying}
            disabled={!question.trim()}
            style={{ height: "auto" }}
          >
            发送
          </Button>
        </Flex>

        {answer && (
          <div style={{ marginTop: 16, padding: 16, background: "#f6ffed", borderRadius: 8, border: "1px solid #b7eb8f" }}>
            <div style={{ fontWeight: "bold", marginBottom: 8, color: "#52c41a" }}>AI 回答：</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{answer}</div>
          </div>
        )}
      </Card>
    </Flex>
  );
};

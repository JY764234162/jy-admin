import { useState, useEffect } from "react";
import {
  Table, Button, Space, Popconfirm, Card, Upload, Flex, Tag,
  Empty, message as antdMessage
} from "antd";
import {
  UploadOutlined, DeleteOutlined, FileTextOutlined, BookOutlined,
  FilePdfOutlined, FileWordOutlined, FileExcelOutlined,
  EyeOutlined, DownloadOutlined, ReloadOutlined, LoadingOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { aiServerApi, type KnowledgeDocument } from "@/api/aiServer";

export const Component = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      antdMessage.success(`文档「${res.filename}」已上传，正在后台解析`);
      fetchDocuments();
    } catch (error: any) {
      console.error("上传失败:", error);
      antdMessage.error(error.message || "文档上传失败");
    } finally {
      setUploading(false);
    }
    return false;
  };

  // 重试解析
  const handleRetry = async (docId: string) => {
    try {
      await aiServerApi.retryKnowledge(docId);
      antdMessage.success("已重新入队解析");
      fetchDocuments();
    } catch (error: any) {
      console.error("重试失败:", error);
      antdMessage.error(error.message || "重试失败");
    }
  };

  // 状态标签
  const getStatusTag = (record: KnowledgeDocument) => {
    switch (record.status) {
      case "pending":
        return <Tag color="default">等待解析</Tag>;
      case "parsing":
        return (
          <Tag color="processing" icon={<LoadingOutlined />}>
            解析中
          </Tag>
        );
      case "indexed":
        return <Tag color="success">已入库</Tag>;
      case "failed":
        return (
          <Tag color="error" title={record.error_msg}>
            失败
          </Tag>
        );
      default:
        return <Tag color="default">等待解析</Tag>;
    }
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
      title: "状态",
      key: "status",
      width: 120,
      render: (_: any, record: KnowledgeDocument) => getStatusTag(record),
    },
    {
      title: "片段数",
      dataIndex: "chunk_count",
      key: "chunk_count",
      width: 110,
      render: (_: any, record: KnowledgeDocument) => {
        if (record.status === "indexed") {
          return <Tag color="green">{record.chunk_count} 段</Tag>;
        }
        if (record.status === "parsing") {
          return <span style={{ color: "#8c8c8c" }}>解析中...</span>;
        }
        return <span style={{ color: "#8c8c8c" }}>-</span>;
      },
    },
    {
      title: "操作",
      key: "action",
      width: 280,
      render: (_: any, record: KnowledgeDocument) => (
        <Space>
          {record.status === "failed" && (
            <Button
              type="link"
              onClick={() => handleRetry(record.doc_id)}
            >
              重试
            </Button>
          )}
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
            disabled={record.status !== "indexed"}
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
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchDocuments} loading={loading}>
              刷新
            </Button>
            <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt,.md,.pdf,.docx,.xlsx,.csv">
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                上传文档
              </Button>
            </Upload>
          </Space>
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
    </Flex>
  );
};

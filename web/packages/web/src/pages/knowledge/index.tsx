import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import {
  Table,
  Button,
  Space,
  Popconfirm,
  Card,
  Upload,
  Flex,
  Tag,
  Empty,
  message as antdMessage,
  Input,
  Dropdown,
  Typography,
  Modal,
} from "antd";
import type { MenuProps } from "antd";
import {
  UploadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  BookOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  EyeOutlined,
  DownloadOutlined,
  ReloadOutlined,
  LoadingOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { aiServerApi, type KnowledgeDocument } from "@/api/aiDirect";
import { layoutSlice } from "@/store/slice/layout";

export const Component = () => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  // 加载文档列表
  const fetchDocuments = async (keyword?: string) => {
    setLoading(true);
    try {
      const res = await aiServerApi.getKnowledgeList(keyword);
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

  const columns: ColumnsType<KnowledgeDocument> = (() => {
    const chunkCell = (_: unknown, record: KnowledgeDocument) => {
      if (record.status === "indexed") {
        return <Tag color="green">{record.chunk_count} 段</Tag>;
      }
      if (record.status === "parsing") {
        return <span style={{ color: "#8c8c8c" }}>解析中...</span>;
      }
      return <span style={{ color: "#8c8c8c" }}>-</span>;
    };

    const actionDesktop = (_: unknown, record: KnowledgeDocument) => (
      <Space wrap size="small">
        {record.status === "failed" && (
          <Button type="link" size="small" onClick={() => handleRetry(record.doc_id)}>
            重试
          </Button>
        )}
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handlePreview(record)}
          disabled={record.status !== "indexed"}
        >
          预览
        </Button>
        <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
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
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      </Space>
    );

    const actionMobile = (_: unknown, record: KnowledgeDocument) => {
      const items: MenuProps["items"] = [
        ...(record.status === "failed"
          ? [{ key: "retry", label: "重试解析", onClick: () => void handleRetry(record.doc_id) }]
          : []),
        {
          key: "preview",
          label: "预览",
          disabled: record.status !== "indexed",
          onClick: () => handlePreview(record),
        },
        { key: "download", label: "下载", onClick: () => handleDownload(record) },
        {
          key: "delete",
          label: "删除",
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: "确认删除",
              content: `确定要删除文档「${record.source}」吗？`,
              okText: "删除",
              okType: "danger",
              cancelText: "取消",
              onOk: () => handleDelete(record.doc_id),
            });
          },
        },
      ];
      return (
        <Dropdown menu={{ items }} trigger={["click"]}>
          <Button type="text" icon={<MoreOutlined />} aria-label="更多操作" />
        </Dropdown>
      );
    };

    if (isMobile) {
      return [
        {
          title: "文档",
          key: "doc",
          ellipsis: true,
          render: (_: unknown, record: KnowledgeDocument) => (
            <Flex vertical gap={4} style={{ minWidth: 0 }}>
              <Space align="start" style={{ width: "100%", minWidth: 0 }}>
                {getFileIcon(record.file_type)}
                <Typography.Text ellipsis style={{ flex: 1, margin: 0 }}>
                  {record.source}
                </Typography.Text>
              </Space>
              <Typography.Text
                type="secondary"
                copyable={{ text: record.doc_id }}
                style={{ fontSize: 12, wordBreak: "break-all", lineHeight: 1.4 }}
              >
                {record.doc_id}
              </Typography.Text>
            </Flex>
          ),
        },
        {
          title: "状态",
          key: "status",
          width: 96,
          render: (_: unknown, record: KnowledgeDocument) => getStatusTag(record),
        },
        {
          title: "片段",
          key: "chunk_count",
          width: 72,
          render: chunkCell,
        },
        {
          title: "",
          key: "action",
          width: 44,
          align: "center",
          render: actionMobile,
        },
      ];
    }

    return [
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
        render: (_: unknown, record: KnowledgeDocument) => getStatusTag(record),
      },
      {
        title: "片段数",
        dataIndex: "chunk_count",
        key: "chunk_count",
        width: 110,
        render: chunkCell,
      },
      {
        title: "操作",
        key: "action",
        width: 280,
        render: actionDesktop,
      },
    ];
  })();

  return (
    <Flex vertical gap={isMobile ? 12 : 16} style={{ padding: isMobile ? 12 : 16, height: "100%", overflow: "auto" }}>
      <Card
        title={
          <Space>
            <BookOutlined />
            <span>知识库文档管理</span>
          </Space>
        }
        extra={
          !isMobile ? (
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchDocuments(searchKeyword)} loading={loading}>
                刷新
              </Button>
              <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt,.md,.pdf,.docx,.xlsx,.csv">
                <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                  上传文档
                </Button>
              </Upload>
            </Space>
          ) : undefined
        }
      >
        {isMobile && (
          <Flex vertical gap={8} style={{ marginBottom: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={() => fetchDocuments(searchKeyword)} loading={loading} block>
              刷新
            </Button>
            <Upload beforeUpload={handleUpload} showUploadList={false} accept=".txt,.md,.pdf,.docx,.xlsx,.csv">
              <Button type="primary" icon={<UploadOutlined />} loading={uploading} block>
                上传文档
              </Button>
            </Upload>
          </Flex>
        )}
        <Input.Search
          placeholder="搜索文档名称"
          allowClear
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onSearch={(value) => fetchDocuments(value)}
          style={{ marginBottom: 16, width: "100%", maxWidth: isMobile ? "100%" : 300 }}
        />
        <Table
          rowKey="doc_id"
          columns={columns}
          dataSource={documents}
          loading={loading}
          pagination={false}
          size={isMobile ? "small" : "middle"}
          scroll={isMobile ? { x: "max-content" } : undefined}
          locale={{ emptyText: <Empty description="暂无文档，请上传" /> }}
        />
      </Card>
    </Flex>
  );
};

import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import {
  Table,
  Button,
  Space,
  Modal,
  Popconfirm,
  Card,
  Input,
  Upload,
  Image,
  Flex,
  Dropdown,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import { UploadOutlined, MoreOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { uploadApi } from "@/api";
import { getImageUrl } from "@/utils/image";
import type { FileInfo, FileListParams } from "@/api/types";
import { layoutSlice } from "@/store/slice/layout";
import styles from "./index.module.css";

export const Component = () => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState("");

  // 加载文件列表
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const params: FileListParams = {
        page,
        page_size: pageSize,
        keyword: searchKeyword || undefined,
      };
      const res = await uploadApi.getFileList(params);
      if (res.code === 0 && res.data) {
        setFiles(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch (error) {
      console.error("获取文件列表失败:", error);
      window.$message?.error("获取文件列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [page, pageSize, searchKeyword]);

  // 上传文件
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadApi.uploadFile(file);
      if (res.code === 0) {
        window.$message?.success("文件上传成功");
        fetchFiles();
      } else {
        window.$message?.error(res.msg || "文件上传失败");
      }
    } catch (error: unknown) {
      console.error("上传失败:", error);
      window.$message?.error(error instanceof Error ? error.message : "文件上传失败");
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 删除文件
  const handleDelete = async (file: FileInfo) => {
    if (!file.key) {
      window.$message?.error("文件信息不完整");
      return;
    }
    try {
      const res = await uploadApi.deleteFile({ key: file.key });
      if (res.code === 0) {
        window.$message?.success("删除文件成功");
        fetchFiles();
      }
    } catch (error) {
      console.error("删除文件失败:", error);
      window.$message?.error("删除文件失败");
    }
  };

  // 预览图片
  const handlePreview = (file: FileInfo) => {
    const imageUrl = getImageUrl(file.url || file.filePath);
    if (imageUrl) {
      setPreviewImage(imageUrl);
      setPreviewVisible(true);
    } else {
      window.$message?.warning("无法预览该文件");
    }
  };

  // 判断是否为图片
  const isImage = (fileType?: string, fileName?: string, name?: string): boolean => {
    if (fileType) {
      return fileType.startsWith("image/");
    }
    const fileNameToCheck = fileName || name;
    if (fileNameToCheck) {
      const ext = fileNameToCheck.split(".").pop()?.toLowerCase();
      return ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext || "");
    }
    return false;
  };

  // 格式化文件大小
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatCreatedAt = (text: string, record: FileInfo) => {
    const createdAt = text || (record as { CreatedAt?: string }).CreatedAt || (record as { created_at?: string }).created_at;
    if (!createdAt) return "-";
    try {
      const d = new Date(createdAt);
      return isMobile ? d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("zh-CN");
    } catch {
      return String(createdAt);
    }
  };

  const columns: ColumnsType<FileInfo> = isMobile
    ? [
        {
          title: "预览",
          dataIndex: "url",
          key: "preview",
          width: 72,
          render: (url: string, record: FileInfo) => {
            if (isImage(record.fileType, record.fileName, record.name)) {
              return (
                <Image
                  src={getImageUrl(url || record.filePath)}
                  alt={record.name || record.fileName}
                  width={48}
                  height={48}
                  style={{ objectFit: "cover", cursor: "pointer", borderRadius: 4 }}
                  preview={false}
                  onClick={() => handlePreview(record)}
                />
              );
            }
            return <span style={{ color: "#999" }}>-</span>;
          },
        },
        {
          title: "文件",
          key: "file",
          ellipsis: true,
          render: (_: unknown, record: FileInfo) => {
            const name = record.name || record.fileName || "-";
            const meta = [record.fileType || "-", formatFileSize(record.fileSize)].join(" · ");
            return (
              <Flex vertical gap={4} style={{ minWidth: 0 }}>
                <Typography.Text ellipsis style={{ margin: 0, maxWidth: "100%" }}>
                  {name}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all" }}>
                  {meta}
                </Typography.Text>
                {record.tag ? (
                  <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: "100%" }}>
                    标签：{record.tag}
                  </Typography.Text>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatCreatedAt(record.createdAt ?? "", record)}
                </Typography.Text>
              </Flex>
            );
          },
        },
        {
          title: "",
          key: "action",
          width: 44,
          align: "center",
          render: (_: unknown, record: FileInfo) => {
            const items: MenuProps["items"] = [
              ...(isImage(record.fileType, record.fileName, record.name)
                ? [{ key: "preview", label: "预览", onClick: () => handlePreview(record) }]
                : []),
              {
                key: "delete",
                label: "删除",
                danger: true,
                onClick: () => {
                  Modal.confirm({
                    title: "确定要删除这个文件吗？",
                    okText: "删除",
                    okType: "danger",
                    cancelText: "取消",
                    onOk: () => void handleDelete(record),
                  });
                },
              },
            ];
            return (
              <Dropdown menu={{ items }} trigger={["click"]}>
                <Button type="text" icon={<MoreOutlined />} aria-label="更多操作" />
              </Dropdown>
            );
          },
        },
      ]
    : [
        {
          title: "ID",
          dataIndex: "ID",
          key: "ID",
          width: 80,
        },
        {
          title: "预览",
          dataIndex: "url",
          key: "preview",
          width: 100,
          render: (url: string, record: FileInfo) => {
            if (isImage(record.fileType, record.fileName, record.name)) {
              return (
                <Image
                  src={getImageUrl(url || record.filePath)}
                  alt={record.name || record.fileName}
                  width={60}
                  height={60}
                  style={{ objectFit: "cover", cursor: "pointer" }}
                  preview={false}
                  onClick={() => handlePreview(record)}
                />
              );
            }
            return <span style={{ color: "#999" }}>-</span>;
          },
        },
        {
          title: "文件名",
          dataIndex: "name",
          key: "name",
          width: 200,
          render: (text: string, record: FileInfo) => text || record.fileName || "-",
        },
        {
          title: "文件类型",
          dataIndex: "fileType",
          key: "fileType",
          width: 120,
          render: (text: string) => text || "-",
        },
        {
          title: "文件大小",
          dataIndex: "fileSize",
          key: "fileSize",
          width: 120,
          render: (size: number) => formatFileSize(size),
        },
        {
          title: "标签",
          dataIndex: "tag",
          key: "tag",
          width: 100,
          render: (text: string) => text || "-",
        },
        {
          title: "创建时间",
          dataIndex: "createdAt",
          key: "createdAt",
          width: 180,
          render: (text: string, record: FileInfo) => formatCreatedAt(text, record),
        },
        {
          title: "操作",
          key: "action",
          width: 150,
          fixed: "right",
          render: (_, record) => (
            <Flex gap="small">
              {isImage(record.fileType, record.fileName, record.name) && (
                <Button type="link" onClick={() => handlePreview(record)} size="small">
                  预览
                </Button>
              )}
              <Popconfirm
                title="确定要删除这个文件吗？"
                onConfirm={() => handleDelete(record)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger size="small">
                  删除
                </Button>
              </Popconfirm>
            </Flex>
          ),
        },
      ];

  return (
    <div className={styles.fileContainer} data-mobile={isMobile ? "1" : undefined}>
      <Card>
        <div className={styles.header}>
          <h2>文件管理</h2>
          {isMobile ? (
            <Flex vertical gap={8} style={{ width: "100%" }}>
              <Input.Search
                placeholder="搜索文件名"
                allowClear
                style={{ width: "100%" }}
                onSearch={(value) => {
                  setSearchKeyword(value);
                  setPage(1);
                }}
              />
              <Upload beforeUpload={handleUpload} showUploadList={false} accept="*/*" disabled={uploading}>
                <Button type="primary" icon={<UploadOutlined />} loading={uploading} block>
                  上传文件
                </Button>
              </Upload>
            </Flex>
          ) : (
            <Space wrap>
              <Input.Search
                placeholder="搜索文件名"
                allowClear
                style={{ width: 250 }}
                onSearch={(value) => {
                  setSearchKeyword(value);
                  setPage(1);
                }}
              />
              <Upload beforeUpload={handleUpload} showUploadList={false} accept="*/*" disabled={uploading}>
                <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                  上传文件
                </Button>
              </Upload>
            </Space>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={files}
          rowKey="ID"
          loading={loading}
          size={isMobile ? "small" : "middle"}
          scroll={isMobile ? { x: 280 } : { x: 1200 }}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: !isMobile,
            showQuickJumper: !isMobile,
            showTotal: isMobile ? undefined : (t) => `共 ${t} 条`,
            simple: isMobile,
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
        />
      </Card>

      {/* 图片预览 */}
      {previewImage && (
        <Image
          style={{ display: "none" }}
          preview={{
            visible: previewVisible,
            onVisibleChange: (visible) => {
              setPreviewVisible(visible);
              if (!visible) {
                setPreviewImage("");
              }
            },
          }}
          src={previewImage}
        />
      )}
    </div>
  );
};


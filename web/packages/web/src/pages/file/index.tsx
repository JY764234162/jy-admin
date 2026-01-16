import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, message, Popconfirm, Card, Input, Upload, Image } from "antd";
import { PlusOutlined, DeleteOutlined, EyeOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { uploadApi } from "@/api";
import { getImageUrl } from "@/utils/image";
import type { FileInfo, FileListParams } from "@/api/types";
import styles from "./index.module.css";

export const Component = () => {
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
      message.error("获取文件列表失败");
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
        message.success("文件上传成功");
        fetchFiles();
      } else {
        message.error(res.msg || "文件上传失败");
      }
    } catch (error: any) {
      console.error("上传失败:", error);
      message.error(error.message || "文件上传失败");
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 删除文件
  const handleDelete = async (file: FileInfo) => {
    if (!file.key) {
      message.error("文件信息不完整");
      return;
    }
    try {
      const res = await uploadApi.deleteFile({ key: file.key });
      if (res.code === 0) {
        message.success("删除文件成功");
        fetchFiles();
      }
    } catch (error) {
      console.error("删除文件失败:", error);
      message.error("删除文件失败");
    }
  };

  // 预览图片
  const handlePreview = (file: FileInfo) => {
    const imageUrl = getImageUrl(file.url || file.filePath);
    if (imageUrl) {
      setPreviewImage(imageUrl);
      setPreviewVisible(true);
    } else {
      message.warning("无法预览该文件");
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

  // 表格列定义
  const columns: ColumnsType<FileInfo> = [
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
      render: (text: string) => (text ? new Date(text).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, record) => (
        <Space size="middle">
          {isImage(record.fileType, record.fileName, record.name) && (
            <Button type="link" icon={<EyeOutlined />} onClick={() => handlePreview(record)} size="small">
              预览
            </Button>
          )}
          <Popconfirm
            title="确定要删除这个文件吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.fileContainer}>
      <Card>
        <div className={styles.header}>
          <h2>文件管理</h2>
          <Space>
            <Input.Search
              placeholder="搜索文件名"
              allowClear
              style={{ width: 250 }}
              onSearch={(value) => {
                setSearchKeyword(value);
                setPage(1);
              }}
            />
            <Upload
              beforeUpload={handleUpload}
              showUploadList={false}
              accept="*/*"
              disabled={uploading}
            >
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                上传文件
              </Button>
            </Upload>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={files}
          rowKey="ID"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
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


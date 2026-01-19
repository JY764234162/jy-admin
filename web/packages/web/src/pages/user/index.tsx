import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, Avatar, Popconfirm, Card, Input, Upload, Image, Select, Flex, Switch } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { GetProp, UploadFile, UploadProps } from "antd";
import type { RcFile } from "antd/es/upload";
import { userApi, uploadApi, authorityApi } from "@/api";
import { getImageUrl } from "@/utils/image";
import type { User, UserListParams } from "@/api/types";
import type { Authority } from "@/api/authority";
import styles from "./index.module.css";

type FileType = Parameters<GetProp<UploadProps, "beforeUpload">>[0];

// 将文件转换为 base64，用于预览
const getBase64 = (file: FileType): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

export const Component = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"create" | "edit">("create");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [authoritiesLoading, setAuthoritiesLoading] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();
  const [resettingUser, setResettingUser] = useState<User | null>(null);

  // 加载用户列表
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: UserListParams = {
        page,
        pageSize,
        // 注意：后端API暂不支持username搜索，如需搜索功能需要后端支持
        // username: searchKeyword || undefined,
      };
      const res = await userApi.getUserList(params);
      if (res.code === 0 && res.data) {
        setUsers(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
      window.$message?.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 加载角色列表
  const fetchAuthorities = async () => {
    setAuthoritiesLoading(true);
    try {
      const res = await authorityApi.getAuthorityList();
      if (res.code === 0 && res.data) {
        setAuthorities(res.data);
      }
    } catch (error) {
      console.error("获取角色列表失败:", error);
      window.$message?.error("获取角色列表失败");
    } finally {
      setAuthoritiesLoading(false);
    }
  };

  // 根据 authorityId 获取角色名称
  const getAuthorityName = (authorityId: string | number | undefined): string => {
    if (!authorityId) return "-";
    const authority = authorities.find((auth) => auth.authorityId === String(authorityId));
    return authority?.authorityName || String(authorityId);
  };

  useEffect(() => {
    fetchUsers();
    fetchAuthorities();
  }, [page, pageSize]);

  // 显示创建用户弹窗
  const showCreateModal = () => {
    setModalType("create");
    setEditingUser(null);
    form.resetFields();
    setFileList([]);
    setModalVisible(true);
  };

  // 显示编辑用户弹窗
  const showEditModal = (user: User) => {
    setModalType("edit");
    setEditingUser(user);

    // 初始化文件列表，如果有头像则显示（使用完整URL用于预览）
    const initialFileList: UploadFile[] = [];
    if (user.headerImg) {
      initialFileList.push({
        uid: "-1",
        name: "avatar.png",
        status: "done",
        url: getImageUrl(user.headerImg) || user.headerImg, // 使用完整URL用于预览
      });
    }
    setFileList(initialFileList);

    form.setFieldsValue({
      username: user.username,
      nickName: user.nickName,
      headerImg: user.headerImg,
      authorityId: String(user.authorityId), // 转换为字符串，因为 Select 的 value 是字符串
    });
    setModalVisible(true);
  };

  // 创建/更新用户
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (modalType === "create") {
        const res = await userApi.createUser({
          username: values.username,
          password: values.password,
          nickName: values.nickName,
          headerImg: values.headerImg,
          authorityId: values.authorityId,
          enable: true, // 默认启用
        });
        if (res.code === 0) {
          window.$message?.success("创建用户成功");
          setModalVisible(false);
          fetchUsers();
        }
      } else {
        if (!editingUser?.ID) {
          window.$message?.error("用户ID不存在");
          return;
        }
        const res = await userApi.updateUser({
          ID: editingUser.ID,
          username: values.username,
          nickName: values.nickName,
          headerImg: values.headerImg,
          authorityId: values.authorityId,
          enable: editingUser.enable !== false, // 保持原有状态
        });
        if (res.code === 0) {
          window.$message?.success("更新用户成功");
          setModalVisible(false);
          fetchUsers();
        }
      }
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      console.error("操作失败:", error);
      window.$message?.error(error.message || "操作失败");
    }
  };

  // 删除用户
  const handleDelete = async (id: number) => {
    try {
      const res = await userApi.deleteUser(id);
      if (res.code === 0) {
        window.$message?.success("删除用户成功");
        fetchUsers();
      }
    } catch (error) {
      console.error("删除用户失败:", error);
      window.$message?.error("删除用户失败");
    }
  };

  // 显示修改密码弹窗
  const showPasswordModal = (user: User) => {
    setResettingUser(user);
    passwordForm.resetFields();
    setPasswordModalVisible(true);
  };

  // 重置密码
  const handleResetPassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (!resettingUser?.ID) {
        window.$message?.error("用户信息不存在");
        return;
      }
      const res = await userApi.resetPassword({
        userId: resettingUser.ID,
        newPassword: values.newPassword,
      });
      if (res.code === 0) {
        window.$message?.success("重置密码成功");
        setPasswordModalVisible(false);
        passwordForm.resetFields();
      }
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      console.error("重置密码失败:", error);
      window.$message?.error(error.message || "重置密码失败");
    }
  };

  // 预览头像
  const handlePreview = async (file: UploadFile) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj as FileType);
    }
    setPreviewImage(file.url || (file.preview as string));
    setPreviewOpen(true);
  };

  // 处理文件列表变化
  const handleChange: UploadProps["onChange"] = ({ fileList: newFileList, file }) => {
    setFileList(newFileList);

    // 如果文件上传成功，更新表单字段
    const doneFile = newFileList.find((f) => f.status === "done" && f.url);
    if (doneFile?.url) {
      form.setFieldsValue({ headerImg: doneFile.url });
    }

    // 如果文件被删除，清空表单字段
    if (newFileList.length === 0) {
      form.setFieldsValue({ headerImg: "" });
    }

    // 如果文件状态是 uploading，说明 customRequest 已经被调用
    // 如果文件状态是 undefined 或 uploading，说明正在上传
    console.log("文件状态变化:", file.status, file);
  };

  // 自定义上传请求
  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError, onProgress }) => {
    console.log("开始上传文件:", file);
    setUploading(true);

    try {
      const fileObj = file as RcFile;

      // 注意：文件验证已经在 beforeUpload 中完成，这里直接上传
      // 模拟上传进度
      onProgress?.({ percent: 10 });

      // 上传文件
      const uploadRes = await uploadApi.uploadFile(fileObj);
      console.log("上传响应:", uploadRes);
      if (uploadRes.code !== 0 || !uploadRes.data) {
        throw new Error(uploadRes.msg || "文件上传失败");
      }

      // 获取文件相对路径（不拼接域名，直接保存相对路径到数据库）
      let filePath = uploadRes.data.url || uploadRes.data.filePath || "";

      // 确保路径格式正确（以 / 开头）
      if (filePath && !filePath.startsWith("/")) {
        filePath = "/" + filePath;
      }

      // 用于预览的完整URL（仅用于显示）
      const fileUrl = getImageUrl(filePath);

      // 更新上传进度
      onProgress?.({ percent: 100 });

      // 更新文件列表，标记为成功
      setFileList((prevList) => {
        const newList = prevList.map((item) => {
          if (item.uid === (file as any).uid) {
            return {
              ...item,
              status: "done" as const,
              url: fileUrl, // 用于预览的完整URL
            };
          }
          return item;
        });

        // 如果之前没有文件，添加新文件
        if (newList.length === 0 || !newList.find((item) => item.uid === (file as any).uid)) {
          newList.push({
            uid: (file as any).uid,
            name: fileObj.name,
            status: "done" as const,
            url: fileUrl, // 用于预览的完整URL
          });
        }

        return newList;
      });

      // 保存相对路径到表单（用于提交到数据库）
      form.setFieldsValue({ headerImg: filePath });
      window.$message?.success("头像上传成功");
      onSuccess?.(uploadRes.data, fileObj as any);
    } catch (error: any) {
      console.error("上传失败:", error);
      window.$message?.error(error.message || "头像上传失败");
      onError?.(error);

      // 更新文件列表，标记为失败
      setFileList((prevList) =>
        prevList.map((item) => {
          if (item.uid === (file as any).uid) {
            return {
              ...item,
              status: "error" as const,
            };
          }
          return item;
        })
      );
    } finally {
      setUploading(false);
    }
  };

  // 表格列定义
  const columns: ColumnsType<User> = [
    {
      title: "ID",
      dataIndex: "ID",
      key: "ID",
      width: 80,
    },
    {
      title: "头像",
      dataIndex: "headerImg",
      key: "headerImg",
      width: 80,
      render: (url: string) => <Avatar src={getImageUrl(url)} icon={!url ? <UserOutlined /> : undefined} size="small" />,
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      width: 150,
    },
    {
      title: "昵称",
      dataIndex: "nickName",
      key: "nickName",
      width: 150,
    },
    {
      title: "角色",
      dataIndex: "authorityId",
      key: "authorityId",
      width: 150,
      render: (authorityId: string | number) => getAuthorityName(authorityId),
    },
    {
      title: "状态",
      dataIndex: "enable",
      key: "enable",
      width: 100,
      render: (enable: boolean, record: User) => (
        <Switch
          checked={enable !== false}
          onChange={async (checked) => {
            try {
              const res = await userApi.updateUser({ ...record, enable: checked });
              if (res.code === 0) {
                window.$message?.success(checked ? "用户已启用" : "用户已禁用");
                fetchUsers();
              }
            } catch (error) {
              console.error("更新用户状态失败:", error);
            }
          }}
        />
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (text: string, record: User) => {
        // 兼容不同的字段名格式
        const createdAt = text || (record as any).CreatedAt || (record as any).created_at;
        if (!createdAt) return "-";
        try {
          return new Date(createdAt).toLocaleString("zh-CN");
        } catch (error) {
          return createdAt;
        }
      },
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      render: (text: string, record: User) => {
        // 兼容不同的字段名格式
        const updatedAt = text || (record as any).UpdatedAt || (record as any).updated_at;
        if (!updatedAt) return "-";
        try {
          return new Date(updatedAt).toLocaleString("zh-CN");
        } catch (error) {
          return updatedAt;
        }
      },
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Flex gap="small">
          <Button type="link" onClick={() => showEditModal(record)} size="small">
            编辑
          </Button>
          <Button type="link" onClick={() => showPasswordModal(record)} size="small">
            修改密码
          </Button>
          <Popconfirm title="确定要删除这个用户吗？" onConfirm={() => record.ID && handleDelete(record.ID)} okText="确定" cancelText="取消">
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <div className={styles.userContainer}>
      <Card>
        <div className={styles.header}>
          <h2>用户管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
            新增用户
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={users}
          rowKey="ID"
          loading={loading}
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
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 创建/编辑用户弹窗 */}
      <Modal
        title={modalType === "create" ? "新增用户" : "编辑用户"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              { min: 3, message: "用户名长度不能少于3位" },
              { max: 20, message: "用户名长度不能超过20位" },
            ]}
          >
            <Input placeholder="请输入用户名" disabled={modalType === "edit"} />
          </Form.Item>

          {modalType === "create" && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 6, message: "密码长度不能少于6位" },
                { max: 20, message: "密码长度不能超过20位" },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}

          <Form.Item
            name="nickName"
            label="昵称"
            rules={[
              { required: true, message: "请输入昵称" },
              { min: 2, message: "昵称长度不能少于2位" },
              { max: 20, message: "昵称长度不能超过20位" },
            ]}
          >
            <Input placeholder="请输入昵称" />
          </Form.Item>

          <Form.Item name="headerImg" label="头像" hidden>
            <Input />
          </Form.Item>
          <Form.Item label=" ">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onPreview={handlePreview}
              onChange={handleChange}
              customRequest={customRequest}
              accept="image/*"
              maxCount={1}
              beforeUpload={(file) => {
                // 验证文件类型
                const isImage = file.type?.startsWith("image/");
                if (!isImage) {
                  window.$message?.error("只能上传图片文件！");
                  return Upload.LIST_IGNORE; // 阻止添加到列表
                }
                // 验证文件大小（5MB）
                const isLt5M = file.size / 1024 / 1024 < 5;
                if (!isLt5M) {
                  window.$message?.error("图片大小不能超过5MB！");
                  return Upload.LIST_IGNORE; // 阻止添加到列表
                }
                // 返回 true 允许文件添加到列表，然后由 customRequest 处理上传
                return true;
              }}
            >
              {fileList.length >= 1 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传头像</div>
                </div>
              )}
            </Upload>
            {previewImage && (
              <Image
                style={{ display: "none" }}
                preview={{
                  visible: previewOpen,
                  onVisibleChange: (visible: boolean) => {
                    setPreviewOpen(visible);
                    if (!visible) {
                      setPreviewImage("");
                    }
                  },
                }}
                src={previewImage}
              />
            )}
            <div style={{ marginTop: "8px", color: "#999", fontSize: "12px" }}>支持 JPG、PNG 格式，大小不超过 5MB</div>
          </Form.Item>

          <Form.Item name="authorityId" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
            <Select
              placeholder="请选择角色"
              loading={authoritiesLoading}
              showSearch
              filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              options={authorities.map((auth) => ({
                label: auth.authorityName,
                value: auth.authorityId,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title={`修改密码 - ${resettingUser?.username || ""}`}
        open={passwordModalVisible}
        onOk={handleResetPassword}
        onCancel={() => {
          setPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
        width={500}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码长度不能少于6位" },
              { max: 20, message: "密码长度不能超过20位" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请确认新密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请确认新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, message, Avatar, Popconfirm, Card, Input } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { userApi } from "@/api";
import type { User, UserListParams } from "@/api/types";
import styles from "./index.module.css";

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
      message.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, pageSize]);


  // 显示创建用户弹窗
  const showCreateModal = () => {
    setModalType("create");
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  // 显示编辑用户弹窗
  const showEditModal = (user: User) => {
    setModalType("edit");
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      nickName: user.nickName,
      headerImg: user.headerImg,
      authorityId: user.authorityId,
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
        });
        if (res.code === 0) {
          message.success("创建用户成功");
          setModalVisible(false);
          fetchUsers();
        }
      } else {
        if (!editingUser?.ID) {
          message.error("用户ID不存在");
          return;
        }
        const res = await userApi.updateUser({
          ID: editingUser.ID,
          username: values.username,
          nickName: values.nickName,
          headerImg: values.headerImg,
          authorityId: values.authorityId,
        });
        if (res.code === 0) {
          message.success("更新用户成功");
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
      message.error(error.message || "操作失败");
    }
  };

  // 删除用户
  const handleDelete = async (id: number) => {
    try {
      const res = await userApi.deleteUser(id);
      if (res.code === 0) {
        message.success("删除用户成功");
        fetchUsers();
      }
    } catch (error) {
      console.error("删除用户失败:", error);
      message.error("删除用户失败");
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
      render: (url: string) => (
        <Avatar src={url} icon={!url ? <UserOutlined /> : undefined} size="small" />
      ),
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
      title: "权限ID",
      dataIndex: "authorityId",
      key: "authorityId",
      width: 120,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (text: string) => (text ? new Date(text).toLocaleString() : "-"),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      render: (text: string) => (text ? new Date(text).toLocaleString() : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => showEditModal(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个用户吗？"
            onConfirm={() => record.ID && handleDelete(record.ID)}
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

          <Form.Item name="headerImg" label="头像URL">
            <Input placeholder="请输入头像URL（可选）" />
          </Form.Item>

          <Form.Item
            name="authorityId"
            label="权限ID"
            rules={[{ required: true, message: "请输入权限ID" }]}
          >
            <Input placeholder="请输入权限ID" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};


import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, Input, message, Popconfirm, Card, Tree, TreeSelect } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { authorityApi, menuApi } from "@/api";
import type { Authority, Menu } from "@/api";
import styles from "./index.module.css";

export const Component = () => {
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"create" | "edit">("create");
  const [editingAuthority, setEditingAuthority] = useState<Authority | null>(null);
  const [allMenus, setAllMenus] = useState<Menu[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([]);
  const [form] = Form.useForm();

  // 加载角色列表
  const fetchAuthorities = async () => {
    setLoading(true);
    try {
      const res = await authorityApi.getAuthorityList();
      if (res.code === 0 && res.data) {
        setAuthorities(res.data);
      }
    } catch (error) {
      console.error("获取角色列表失败:", error);
      message.error("获取角色列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 加载菜单列表
  const fetchMenus = async () => {
    try {
      const res = await menuApi.getMenuList();
      if (res.code === 0 && res.data) {
        setAllMenus(res.data);
      }
    } catch (error) {
      console.error("获取菜单列表失败:", error);
    }
  };

  useEffect(() => {
    fetchAuthorities();
    fetchMenus();
  }, []);

  // 显示创建角色弹窗
  const showCreateModal = () => {
    setModalType("create");
    setEditingAuthority(null);
    form.resetFields();
    // 设置父角色默认值为"0"（根角色）
    form.setFieldsValue({
      parentId: "0",
    });
    setModalVisible(true);
  };

  // 显示编辑角色弹窗
  const showEditModal = (authority: Authority) => {
    setModalType("edit");
    setEditingAuthority(authority);
    // 如果parentId为空或0，表示是根节点
    const parentId = authority.parentId && authority.parentId !== "0" ? authority.parentId : undefined;
    form.setFieldsValue({
      authorityId: authority.authorityId,
      authorityName: authority.authorityName,
      parentId: parentId || "0", // 根节点使用"0"
      defaultRouter: authority.defaultRouter || "dashboard",
    });
    setModalVisible(true);
  };

  // 显示权限设置弹窗
  const showPermissionModal = async (authority: Authority) => {
    setEditingAuthority(authority);
    try {
      const res = await authorityApi.getAuthorityMenus(authority.authorityId);
      if (res.code === 0 && res.data) {
        const menuIds = res.data.map((menu) => menu.ID).filter((id): id is number => id !== undefined);
        setSelectedMenuIds(menuIds);
      }
    } catch (error) {
      console.error("获取角色菜单权限失败:", error);
    }
    setPermissionModalVisible(true);
  };

  // 创建/更新角色
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 处理parentId：如果为空、undefined或"0"，则传递"0"（根节点）
      const parentId = values.parentId && values.parentId !== "0" ? values.parentId : "0";

      if (modalType === "create") {
        const res = await authorityApi.createAuthority({
          authorityId: values.authorityId,
          authorityName: values.authorityName,
          parentId: parentId,
          defaultRouter: values.defaultRouter || "dashboard",
        });
        if (res.code === 0) {
          message.success("创建角色成功");
          setModalVisible(false);
          fetchAuthorities();
        }
      } else {
        if (!editingAuthority) {
          message.error("角色信息不存在");
          return;
        }
        const res = await authorityApi.updateAuthority({
          ...editingAuthority,
          authorityName: values.authorityName,
          parentId: parentId,
          defaultRouter: values.defaultRouter || "dashboard",
        });
        if (res.code === 0) {
          message.success("更新角色成功");
          setModalVisible(false);
          fetchAuthorities();
        }
      }
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      console.error("操作失败:", error);
      message.error(error.message || "操作失败");
    }
  };

  // 删除角色
  const handleDelete = async (authorityId: string) => {
    try {
      const res = await authorityApi.deleteAuthority({ authorityId });
      if (res.code === 0) {
        message.success("删除角色成功");
        fetchAuthorities();
      }
    } catch (error) {
      console.error("删除角色失败:", error);
      message.error("删除角色失败");
    }
  };

  // 保存权限设置
  const handleSavePermission = async () => {
    if (!editingAuthority) {
      return;
    }
    try {
      const res = await authorityApi.setAuthorityMenus({
        authorityId: editingAuthority.authorityId,
        menuIds: selectedMenuIds,
      });
      if (res.code === 0) {
        message.success("设置权限成功");
        setPermissionModalVisible(false);
      }
    } catch (error) {
      console.error("设置权限失败:", error);
      message.error("设置权限失败");
    }
  };

  // 将菜单列表转换为树形数据
  const convertMenusToTreeData = (menus: Menu[]): any[] => {
    return menus.map((menu) => ({
      title: menu.meta?.title || menu.name,
      key: menu.ID,
      children: menu.children && menu.children.length > 0 ? convertMenusToTreeData(menu.children) : undefined,
    }));
  };

  // 扩展Authority类型以支持树形结构
  type AuthorityWithChildren = Authority & {
    children?: AuthorityWithChildren[];
  };

  // 将角色列表转换为树形数据（用于Table树状显示）
  const convertAuthoritiesToTableTreeData = (authorities: Authority[]): AuthorityWithChildren[] => {
    // 构建角色映射
    const authorityMap = new Map<string, AuthorityWithChildren>();
    authorities.forEach((auth) => {
      authorityMap.set(auth.authorityId, { ...auth });
    });

    // 构建树形结构
    const treeData: AuthorityWithChildren[] = [];
    authorities.forEach((auth) => {
      const authority = authorityMap.get(auth.authorityId)!;
      if (!auth.parentId || auth.parentId === "0" || auth.parentId === "") {
        // 根节点（parentId为"0"或空），直接作为顶级节点显示
        treeData.push(authority);
      } else {
        // 子节点
        const parent = authorityMap.get(auth.parentId);
        if (parent) {
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(authority);
        } else {
          // 如果找不到父节点，也作为根节点处理
          treeData.push(authority);
        }
      }
    });

    // 清理空的 children 数组，确保没有子节点的节点不显示展开按钮
    const cleanChildren = (nodes: AuthorityWithChildren[]): AuthorityWithChildren[] => {
      return nodes.map((node) => {
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: cleanChildren(node.children),
          };
        } else {
          // 如果没有子节点，移除 children 属性
          const { children, ...rest } = node;
          return rest;
        }
      });
    };

    return cleanChildren(treeData);
  };

  // 将角色列表转换为树形数据（用于TreeSelect）
  const convertAuthoritiesToTreeData = (authorities: Authority[], excludeId?: string): any[] => {
    // 过滤掉当前编辑的角色，避免选择自己作为父级
    const filteredAuthorities = excludeId ? authorities.filter((auth) => auth.authorityId !== excludeId) : authorities;

    // 递归构建树形结构
    const buildTree = (parentId: string): any[] => {
      return filteredAuthorities
        .filter((auth) => {
          // 查找指定parentId的子节点
          return auth.parentId === parentId;
        })
        .map((auth) => ({
          title: `${auth.authorityName} (${auth.authorityId})`,
          value: auth.authorityId,
          key: auth.authorityId,
          children: buildTree(auth.authorityId),
        }));
    };

    // 构建根角色的子节点（所有parentId为"0"或空的角色）
    const rootChildren = buildTree("0");

    // 返回根角色节点，其子节点是所有parentId为"0"的角色
    return [
      {
        title: "根角色",
        value: "0",
        key: "0",
        children: rootChildren,
      },
    ];
  };

  // 表格列定义
  const columns: ColumnsType<Authority> = [
    {
      title: "角色ID",
      dataIndex: "authorityId",
      key: "authorityId",
      width: 120,
    },
    {
      title: "角色名称",
      dataIndex: "authorityName",
      key: "authorityName",
      width: 200,
    },
    {
      title: "父角色ID",
      dataIndex: "parentId",
      key: "parentId",
      width: 120,
      render: (text: string) => {
        if (!text || text === "0") {
          return "根角色";
        }
        // 查找父角色名称
        const parent = authorities.find((auth) => auth.authorityId === text);
        return parent ? `${parent.authorityName} (${text})` : text;
      },
    },
    {
      title: "默认路由",
      dataIndex: "defaultRouter",
      key: "defaultRouter",
      width: 150,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (text: string) => (text ? new Date(text).toLocaleString() : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EditOutlined />} onClick={() => showEditModal(record)} size="small">
            编辑
          </Button>
          <Button type="link" icon={<SettingOutlined />} onClick={() => showPermissionModal(record)} size="small">
            权限
          </Button>
          <Popconfirm title="确定要删除这个角色吗？" onConfirm={() => handleDelete(record.authorityId)} okText="确定" cancelText="取消">
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.authorityContainer}>
      <Card>
        <div className={styles.header}>
          <h2>角色管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
            新增角色
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={convertAuthoritiesToTableTreeData(authorities)}
          rowKey="authorityId"
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={false}
          defaultExpandAllRows
        />
      </Card>

      {/* 创建/编辑角色弹窗 */}
      <Modal
        title={modalType === "create" ? "新增角色" : "编辑角色"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="authorityId"
            label="角色ID"
            rules={[
              { required: true, message: "请输入角色ID" },
              { pattern: /^[0-9]+$/, message: "角色ID必须为数字" },
            ]}
          >
            <Input placeholder="请输入角色ID（如：888）" disabled={modalType === "edit"} />
          </Form.Item>

          <Form.Item
            name="authorityName"
            label="角色名称"
            rules={[
              { required: true, message: "请输入角色名称" },
              { min: 2, message: "角色名称长度不能少于2位" },
              { max: 50, message: "角色名称长度不能超过50位" },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>

          <Form.Item
            name="parentId"
            label="父角色"
            rules={[
              { required: true, message: "请选择父角色" },
            ]}
            initialValue="0"
          >
            <TreeSelect
              placeholder="请选择父角色"
              treeData={convertAuthoritiesToTreeData(authorities, modalType === "edit" ? editingAuthority?.authorityId : undefined)}
              showSearch
              treeDefaultExpandAll
              filterTreeNode={(inputValue, treeNode) => {
                return (treeNode.title as string)?.toLowerCase().includes(inputValue.toLowerCase()) || false;
              }}
            />
          </Form.Item>

          <Form.Item name="defaultRouter" label="默认路由">
            <Input placeholder="请输入默认路由（如：dashboard）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限设置弹窗 */}
      <Modal
        title={`设置权限 - ${editingAuthority?.authorityName}`}
        open={permissionModalVisible}
        onOk={handleSavePermission}
        onCancel={() => {
          setPermissionModalVisible(false);
          setSelectedMenuIds([]);
        }}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Tree
            checkable
            checkedKeys={selectedMenuIds}
            onCheck={(checkedKeys) => {
              setSelectedMenuIds(checkedKeys as number[]);
            }}
            treeData={convertMenusToTreeData(allMenus)}
          />
        </div>
      </Modal>
    </div>
  );
};

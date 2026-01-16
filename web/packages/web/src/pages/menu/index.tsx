import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, Input, InputNumber, Switch, message, Popconfirm, Card, Tree } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { menuApi } from "@/api";
import type { Menu } from "@/api";
import styles from "./index.module.css";

export const Component = () => {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [flatMenus, setFlatMenus] = useState<(Menu & { menuLevel: number })[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"create" | "edit">("create");
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [form] = Form.useForm();

  // 加载菜单列表
  const fetchMenus = async () => {
    setLoading(true);
    try {
      const res = await menuApi.getMenuList();
      if (res.code === 0 && res.data) {
        setMenus(res.data);
        // 扁平化菜单列表用于表格显示
        setFlatMenus(flattenMenus(res.data));
      }
    } catch (error) {
      console.error("获取菜单列表失败:", error);
      message.error("获取菜单列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 扁平化菜单树
  const flattenMenus = (menuList: Menu[], level = 0): (Menu & { menuLevel: number })[] => {
    let result: (Menu & { menuLevel: number })[] = [];
    menuList.forEach((menu) => {
      result.push({ ...menu, menuLevel: level });
      if (menu.children && menu.children.length > 0) {
        result = result.concat(flattenMenus(menu.children, level + 1));
      }
    });
    return result;
  };

  useEffect(() => {
    fetchMenus();
  }, []);

  // 显示创建菜单弹窗
  const showCreateModal = (parentMenu?: Menu) => {
    setModalType("create");
    setEditingMenu(null);
    form.resetFields();
    if (parentMenu) {
      form.setFieldsValue({
        parentId: parentMenu.ID?.toString() || "0",
      });
    } else {
      form.setFieldsValue({
        parentId: "0",
      });
    }
    setModalVisible(true);
  };

  // 显示编辑菜单弹窗
  const showEditModal = (menu: Menu) => {
    setModalType("edit");
    setEditingMenu(menu);
    form.setFieldsValue({
      path: menu.path,
      name: menu.name,
      component: menu.component,
      parentId: menu.parentId,
      sort: menu.sort || 0,
      hidden: menu.hidden || false,
      meta: {
        title: menu.meta?.title || "",
        icon: menu.meta?.icon || "",
        closeTab: menu.meta?.closeTab || false,
        keepAlive: menu.meta?.keepAlive || false,
        defaultMenu: menu.meta?.defaultMenu || false,
      },
    });
    setModalVisible(true);
  };

  // 创建/更新菜单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (modalType === "create") {
        const res = await menuApi.createMenu({
          path: values.path,
          name: values.name,
          component: values.component,
          parentId: values.parentId || "0",
          sort: values.sort || 0,
          hidden: values.hidden || false,
          meta: {
            title: values.meta.title,
            icon: values.meta.icon || "",
            closeTab: values.meta.closeTab || false,
            keepAlive: values.meta.keepAlive || false,
            defaultMenu: values.meta.defaultMenu || false,
          },
        });
        if (res.code === 0) {
          message.success("创建菜单成功");
          setModalVisible(false);
          fetchMenus();
        }
      } else {
        if (!editingMenu?.ID) {
          message.error("菜单ID不存在");
          return;
        }
        const res = await menuApi.updateMenu({
          ID: editingMenu.ID,
          path: values.path,
          name: values.name,
          component: values.component,
          parentId: values.parentId || "0",
          sort: values.sort || 0,
          hidden: values.hidden || false,
          meta: {
            title: values.meta.title,
            icon: values.meta.icon || "",
            closeTab: values.meta.closeTab || false,
            keepAlive: values.meta.keepAlive || false,
            defaultMenu: values.meta.defaultMenu || false,
          },
        });
        if (res.code === 0) {
          message.success("更新菜单成功");
          setModalVisible(false);
          fetchMenus();
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

  // 删除菜单
  const handleDelete = async (id: number) => {
    try {
      const res = await menuApi.deleteMenu(id);
      if (res.code === 0) {
        message.success("删除菜单成功");
        fetchMenus();
      }
    } catch (error: any) {
      console.error("删除菜单失败:", error);
      message.error(error.response?.data?.msg || "删除菜单失败");
    }
  };

  // 表格列定义
  const columns: ColumnsType<Menu & { menuLevel?: number }> = [
    {
      title: "ID",
      dataIndex: "ID",
      key: "ID",
      width: 80,
    },
    {
      title: "菜单名称",
      dataIndex: ["meta", "title"],
      key: "title",
      width: 200,
      render: (text: string, record: Menu) => {
        const indent = record.menuLevel ? "　".repeat(record.menuLevel) : "";
        return (
          <span>
            {indent}
            {text || record.name}
          </span>
        );
      },
    },
    {
      title: "路由路径",
      dataIndex: "path",
      key: "path",
      width: 200,
    },
    {
      title: "路由名称",
      dataIndex: "name",
      key: "name",
      width: 150,
    },
    {
      title: "组件路径",
      dataIndex: "component",
      key: "component",
      width: 200,
    },
    {
      title: "图标",
      dataIndex: ["meta", "icon"],
      key: "icon",
      width: 100,
    },
    {
      title: "排序",
      dataIndex: "sort",
      key: "sort",
      width: 80,
    },
    {
      title: "隐藏",
      dataIndex: "hidden",
      key: "hidden",
      width: 80,
      render: (hidden: boolean) => (hidden ? "是" : "否"),
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<PlusOutlined />} onClick={() => showCreateModal(record)} size="small">
            添加子菜单
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => showEditModal(record)} size="small">
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个菜单吗？"
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
    <div className={styles.menuContainer}>
      <Card>
        <div className={styles.header}>
          <h2>菜单管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showCreateModal()}>
            新增菜单
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={flatMenus}
          rowKey="ID"
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 创建/编辑菜单弹窗 */}
      <Modal
        title={modalType === "create" ? "新增菜单" : "编辑菜单"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="父菜单ID">
            <Input placeholder="请输入父菜单ID（0表示顶级菜单）" />
          </Form.Item>

          <Form.Item
            name="path"
            label="路由路径"
            rules={[{ required: true, message: "请输入路由路径" }]}
          >
            <Input placeholder="请输入路由路径（如：/system/user）" />
          </Form.Item>

          <Form.Item name="name" label="路由名称" rules={[{ required: true, message: "请输入路由名称" }]}>
            <Input placeholder="请输入路由名称（如：user）" />
          </Form.Item>

          <Form.Item name="component" label="组件路径">
            <Input placeholder="请输入组件路径（如：@/pages/user/index）" />
          </Form.Item>

          <Form.Item name={["meta", "title"]} label="菜单标题" rules={[{ required: true, message: "请输入菜单标题" }]}>
            <Input placeholder="请输入菜单标题" />
          </Form.Item>

          <Form.Item name={["meta", "icon"]} label="菜单图标">
            <Input placeholder="请输入图标名称（如：UserOutlined）" />
          </Form.Item>

          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} placeholder="请输入排序值" style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="hidden" label="是否隐藏" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>

          <Form.Item name={["meta", "keepAlive"]} label="是否缓存" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>

          <Form.Item name={["meta", "closeTab"]} label="自动关闭Tab" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>

          <Form.Item name={["meta", "defaultMenu"]} label="基础路由" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};


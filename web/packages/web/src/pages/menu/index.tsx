import { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, Input, InputNumber, Switch, Popconfirm, Card, Tree, Flex, TreeSelect } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { menuApi } from "@/api";
import type { Menu } from "@/api";
import styles from "./index.module.css";

export const Component = () => {
  const [menus, setMenus] = useState<Menu[]>([]);
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
      }
    } catch (error) {
      console.error("获取菜单列表失败:", error);
      window.$message?.error("获取菜单列表失败");
    } finally {
      setLoading(false);
    }
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
      enable: menu.enable !== false, // 保持原有状态
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
          enable: true, // 默认启用
          meta: {
            title: values.meta.title,
            icon: values.meta.icon || "",
            closeTab: values.meta.closeTab || false,
            keepAlive: values.meta.keepAlive || false,
            defaultMenu: values.meta.defaultMenu || false,
          },
        });
        if (res.code === 0) {
          window.$message?.success("创建菜单成功");
          setModalVisible(false);
          fetchMenus();
        }
      } else {
        if (!editingMenu?.ID) {
          window.$message?.error("菜单ID不存在");
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
          enable: editingMenu.enable !== false, // 保持原有状态
          meta: {
            title: values.meta.title,
            icon: values.meta.icon || "",
            closeTab: values.meta.closeTab || false,
            keepAlive: values.meta.keepAlive || false,
            defaultMenu: values.meta.defaultMenu || false,
          },
        });
        if (res.code === 0) {
          window.$message?.success("更新菜单成功");
          setModalVisible(false);
          fetchMenus();
        }
      }
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      console.error("操作失败:", error);
      window.$message?.error(error.message || "操作失败");
    }
  };

  // 删除菜单
  const handleDelete = async (id: number) => {
    try {
      const res = await menuApi.deleteMenu(id);
      if (res.code === 0) {
        window.$message?.success("删除菜单成功");
        fetchMenus();
      }
    } catch (error: any) {
      console.error("删除菜单失败:", error);
      window.$message?.error(error.response?.data?.msg || "删除菜单失败");
    }
  };



  // 在菜单树中查找指定路径的菜单
  const findMenuByPath = (menus: Menu[], path: string): Menu | null => {
    for (const menu of menus) {
      if (menu.path === path) {
        return menu;
      }
      if (menu.children && menu.children.length > 0) {
        const found = findMenuByPath(menu.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // 将菜单列表转换为树形数据（用于TreeSelect）
  const convertMenusToTreeData = (menuList: Menu[], excludeId?: number): any[] => {
    // 扁平化菜单列表，方便查找
    const flattenMenus = (menus: Menu[]): Menu[] => {
      let result: Menu[] = [];
      menus.forEach((menu) => {
        result.push(menu);
        if (menu.children && menu.children.length > 0) {
          result = result.concat(flattenMenus(menu.children));
        }
      });
      return result;
    };

    const allMenus = flattenMenus(menuList);
    // 过滤掉当前编辑的菜单及其所有子菜单，避免选择自己或自己的子菜单作为父级
    const filteredMenus = excludeId
      ? allMenus.filter((menu) => {
        // 排除当前编辑的菜单
        if (menu.ID === excludeId) return false;
        // 排除当前编辑菜单的所有子菜单
        const isChildOfExcluded = (menuToCheck: Menu, excludedMenuId: number): boolean => {
          if (menuToCheck.parentId === String(excludedMenuId)) return true;
          const parent = allMenus.find((m) => m.ID?.toString() === menuToCheck.parentId);
          if (parent && parent.ID === excludedMenuId) return true;
          if (parent && parent.ID) {
            return isChildOfExcluded(parent, excludedMenuId);
          }
          return false;
        };
        return !isChildOfExcluded(menu, excludeId);
      })
      : allMenus;

    // 递归构建树形结构
    const buildTree = (parentId: string): any[] => {
      return filteredMenus
        .filter((menu) => {
          // 查找指定parentId的子节点
          return menu.parentId === parentId;
        })
        .map((menu) => ({
          title: `${menu.meta?.title || menu.name} (${menu.path})`,
          value: menu.ID?.toString() || "0",
          key: menu.ID?.toString() || "0",
          children: buildTree(menu.ID?.toString() || "0"),
        }));
    };

    // 构建根菜单的子节点（所有parentId为"0"的菜单）
    const rootChildren = buildTree("0");

    // 返回根菜单节点，其子节点是所有parentId为"0"的菜单
    return [
      {
        title: "根菜单（顶级菜单）",
        value: "0",
        key: "0",
        children: rootChildren,
      },
    ];
  };

  // 表格列定义
  const columns: ColumnsType<Menu & { menuLevel?: number }> = [
    {
      title: "排序",
      dataIndex: "sort",
      key: "sort",
      width: 120,
    },
    {
      title: "菜单名称",
      dataIndex: ["meta", "title"],
      key: "title",
      width: 150,
      ellipsis: true,
      render: (text: string, record: Menu) => {
        return <span style={{ whiteSpace: "nowrap" }}>{text || record.name}</span>;
      },
    },
    {
      title: "路由路径",
      dataIndex: "path",
      key: "path",
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
      width: 150,
    },

    {
      title: "隐藏",
      dataIndex: "hidden",
      key: "hidden",
      width: 80,
      render: (hidden: boolean) => (hidden ? "是" : "否"),
    },
    {
      title: "状态",
      dataIndex: "enable",
      key: "enable",
      width: 100,
      render: (enable: boolean, record: Menu) => (
        <Switch
          checked={enable !== false}
          onChange={async (checked) => {
            try {
              const res = await menuApi.updateMenu({ ...record, enable: checked });
              if (res.code === 0) {
                window.$message?.success(checked ? "菜单已启用" : "菜单已禁用");
                fetchMenus();
              }
            } catch (error) {
              console.error("更新菜单状态失败:", error);
            }
          }}
        />
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Flex gap="small">
          <Button type="link" onClick={() => showCreateModal(record)} size="small">
            添加子菜单
          </Button>
          <Button type="link" onClick={() => showEditModal(record)} size="small">
            编辑
          </Button>
          <Popconfirm title="确定要删除这个菜单吗？" onConfirm={() => record.ID && handleDelete(record.ID)} okText="确定" cancelText="取消">
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <div className={styles.menuContainer}>
      <Card>
        <div className={styles.header}>
          <h2>菜单管理</h2>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showCreateModal()}>
              新增菜单
            </Button>

          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={menus}
          rowKey="ID"
          loading={loading}
          pagination={false}
          scroll={{ x: 1300 }}
          defaultExpandAllRows
          indentSize={20}
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
          <Form.Item
            name="parentId"
            label="父菜单"
            rules={[{ required: true, message: "请选择父菜单" }]}
            initialValue="0"
          >
            <TreeSelect
              placeholder="请选择父菜单"
              treeData={convertMenusToTreeData(menus, modalType === "edit" ? editingMenu?.ID : undefined)}
              showSearch
              treeDefaultExpandAll
              filterTreeNode={(inputValue, treeNode) => {
                return (treeNode.title as string)?.toLowerCase().includes(inputValue.toLowerCase()) || false;
              }}
            />
          </Form.Item>

          <Form.Item name="path" label="路由路径" rules={[{ required: true, message: "请输入路由路径" }]}>
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

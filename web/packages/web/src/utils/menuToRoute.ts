/**
 * 将后端菜单数据转换为前端路由格式
 */
import type { Menu } from "@/api/menu";
import { iconMap } from "@/store/slice/route/shared";

/**
 * 将菜单数据转换为路由格式
 * @param menus 菜单列表（树形结构）
 * @returns 路由列表
 */
export const convertMenusToRoutes = (menus: Menu[]): any[] => {
  return menus.map((menu) => {
    // 处理图标：如果是字符串，尝试从 iconMap 中获取组件
    let icon: any = undefined;
    if (menu.meta?.icon) {
      if (typeof menu.meta.icon === "string") {
        icon = iconMap[menu.meta.icon] || menu.meta.icon;
      } else {
        icon = menu.meta.icon;
      }
    }

    const route: any = {
      path: menu.path.replace(/^\//, ""), // 移除开头的斜杠，因为路由是相对路径
      handle: {
        menuTitle: menu.meta?.title || menu.name,
        icon: icon,
        hidden: menu.hidden || false,
      },
    };

    // 如果有子菜单，递归转换
    if (menu.children && menu.children.length > 0) {
      route.children = convertMenusToRoutes(menu.children);
    }

    return route;
  });
};

import type { Menu } from "@/api";

/**
 * 权限管理工具
 */

// 声明路由类型（避免循环依赖）
type ElegantConstRoute = {
  path?: string;
  children?: ElegantConstRoute[];
  handle?: {
    menuTitle?: string;
    icon?: string;
    hidden?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
};

/**
 * 检查用户是否有权限访问指定路径
 * @param path 路由路径
 * @param userMenus 用户的菜单权限列表
 */
export const hasPermission = (path: string, userMenus: Menu[]): boolean => {
  if (!path || userMenus.length === 0) {
    return false;
  }

  // 规范化路径（移除末尾的斜杠，统一格式）
  const normalizedPath = path.replace(/\/$/, "") || "/";
  
  // 检查路径是否在用户菜单权限中
  const checkMenu = (menus: Menu[]): boolean => {
    for (const menu of menus) {
      if (!menu.path) {
        continue;
      }
      
      const menuPath = menu.path.replace(/\/$/, "") || "/";
      
      // 精确匹配
      if (menuPath === normalizedPath) {
        return true;
      }
      
      // 前缀匹配（支持子路径，如 /system 匹配 /system/user）
      if (normalizedPath.startsWith(menuPath + "/") || normalizedPath === menuPath) {
        return true;
      }
      
      // 递归检查子菜单
      if (menu.children && menu.children.length > 0) {
        if (checkMenu(menu.children)) {
          return true;
        }
      }
    }
    return false;
  };

  return checkMenu(userMenus);
};

/**
 * 根据权限过滤路由
 * @param routes 路由列表
 * @param userMenus 用户的菜单权限列表
 * @param parentPath 父路径（用于构建完整路径）
 */
export const filterRoutesByPermission = (routes: ElegantConstRoute[], userMenus: Menu[], parentPath = ""): ElegantConstRoute[] => {
  return routes
    .map((route) => {
      // 如果路由没有path，保留（如首页等基础路由）
      if (!route.path) {
        return route;
      }

      // 构建完整路径
      const fullPath = parentPath ? `${parentPath}/${route.path}` : `/${route.path}`;

      // 检查路由路径是否有权限
      const hasAccess = hasPermission(fullPath, userMenus);

      // 如果有子路由，递归过滤
      let filteredChildren: ElegantConstRoute[] | undefined;
      if (route.children && route.children.length > 0) {
        filteredChildren = filterRoutesByPermission(route.children, userMenus, fullPath);
        // 如果子路由都被过滤掉了，但父路由有权限，保留父路由
        if (filteredChildren.length === 0 && !hasAccess) {
          return null;
        }
      } else if (!hasAccess) {
        return null;
      }

      return {
        ...route,
        children: filteredChildren,
      };
    })
    .filter((route): route is ElegantConstRoute => route !== null);
};


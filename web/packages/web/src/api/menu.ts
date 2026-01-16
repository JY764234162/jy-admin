import request from "@/utils/request";
import type { ApiResponse } from "./types";

/**
 * 菜单信息
 */
export interface Menu {
  ID?: number;
  parentId: string;
  path: string;
  name: string;
  hidden?: boolean;
  component?: string;
  sort?: number;
  meta?: {
    title: string;
    icon?: string;
    closeTab?: boolean;
    keepAlive?: boolean;
    defaultMenu?: boolean;
  };
  children?: Menu[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 菜单管理 API
 */
export const menuApi = {
  /**
   * 获取菜单列表（树形结构）
   */
  getMenuList: (): Promise<ApiResponse<Menu[]>> => {
    return request.get("/menu/list");
  },

  /**
   * 创建菜单
   */
  createMenu: (data: Omit<Menu, "ID" | "children" | "createdAt" | "updatedAt">): Promise<ApiResponse<Menu>> => {
    return request.post("/menu", data);
  },

  /**
   * 更新菜单
   */
  updateMenu: (data: Menu): Promise<ApiResponse<Menu>> => {
    return request.put("/menu", data);
  },

  /**
   * 删除菜单
   */
  deleteMenu: (id: number): Promise<ApiResponse> => {
    return request.delete(`/menu/${id}`);
  },
};


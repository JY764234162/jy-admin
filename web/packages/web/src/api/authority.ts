import request from "@/utils/request";
import type { ApiResponse, PageResult } from "./types";
import { Menu } from "./menu";

/**
 * 角色信息
 */
export interface Authority {
  ID?: number;
  authorityId: string;
  authorityName: string;
  parentId?: string;
  defaultRouter?: string;
  enable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 角色列表参数
 */
export interface AuthorityListParams {
  page?: number;
  pageSize?: number;
}

/**
 * 设置角色菜单请求
 */
export interface SetAuthorityMenusRequest {
  authorityId: string;
  menuIds: number[];
}

/**
 * 角色管理 API
 */
export const authorityApi = {
  /**
   * 获取角色列表
   */
  getAuthorityList: (): Promise<ApiResponse<Authority[]>> => {
    return request.get("/authority/list");
  },

  /**
   * 创建角色
   */
  createAuthority: (data: Omit<Authority, "ID" | "createdAt" | "updatedAt">): Promise<ApiResponse<Authority>> => {
    return request.post("/authority", data);
  },

  /**
   * 更新角色
   */
  updateAuthority: (data: Authority): Promise<ApiResponse<Authority>> => {
    return request.put("/authority", data);
  },

  /**
   * 删除角色
   */
  deleteAuthority: (data: { authorityId: string }): Promise<ApiResponse> => {
    return request.delete("/authority", { data });
  },

  /**
   * 获取当前用户的菜单权限（树状结构）
   * 从token中解析用户角色，无需传递角色ID参数
   */
  getAuthorityMenus: (): Promise<ApiResponse<Menu[]>> => {
    return request.get("/authority/getMenus");
  },

  /**
   * 根据角色ID获取菜单权限（用于角色管理页面）
   * @param authorityId 角色ID
   */
  getAuthorityMenusByRole: (authorityId: string): Promise<ApiResponse<Menu[]>> => {
    return request.get("/authority/getMenusByRole", { params: { authorityId } });
  },

  /**
   * 设置角色的菜单权限
   */
  setAuthorityMenus: (data: SetAuthorityMenusRequest): Promise<ApiResponse> => {
    return request.post("/authority/setMenus", data);
  },
};


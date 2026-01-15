import request from "@/utils/request";
import type { ApiResponse, User, UserListParams, ChangePasswordRequest, UpdateProfileRequest, PageResult } from "./types";

/**
 * 用户管理 API
 */
export const userApi = {
  /**
   * 获取用户列表
   */
  getUserList: (params?: UserListParams): Promise<ApiResponse<PageResult<User>>> => {
    return request.get("/user/list", { params });
  },

  /**
   * 创建用户
   */
  createUser: (data: Omit<User, "ID" | "createdAt" | "updatedAt">): Promise<ApiResponse<User>> => {
    return request.post("/user", data);
  },

  /**
   * 更新用户
   */
  updateUser: (data: User): Promise<ApiResponse<User>> => {
    return request.put("/user", data);
  },

  /**
   * 删除用户
   */
  deleteUser: (id: number): Promise<ApiResponse> => {
    return request.delete(`/user/${id}`);
  },

  /**
   * 修改密码
   */
  changePassword: (data: ChangePasswordRequest): Promise<ApiResponse> => {
    return request.post("/user/changePassword", data);
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: (): Promise<ApiResponse<StorageType.UserInfo>> => {
    return request.get("/user/current");
  },

  /**
   * 更新个人资料（昵称、头像）
   */
  updateProfile: (data: UpdateProfileRequest): Promise<ApiResponse<StorageType.UserInfo>> => {
    return request.put("/user/profile", data);
  },
};

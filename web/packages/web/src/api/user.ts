import request from "@/utils/request";
import type {
  ApiResponse,
  User,
  UserListParams,
  ChangePasswordRequest,
  PageResult,
} from "./types";

/**
 * 用户管理 API
 */
export const userApi = {
  /**
   * 获取用户列表
   */
  getUserList: (params?: UserListParams): Promise<ApiResponse<PageResult<User>>> => {
    return request.get("/api/user/list", { params });
  },

  /**
   * 创建用户
   */
  createUser: (data: Omit<User, "ID" | "createdAt" | "updatedAt">): Promise<ApiResponse<User>> => {
    return request.post("/api/user", data);
  },

  /**
   * 更新用户
   */
  updateUser: (data: User): Promise<ApiResponse<User>> => {
    return request.put("/api/user", data);
  },

  /**
   * 删除用户
   */
  deleteUser: (id: number): Promise<ApiResponse> => {
    return request.delete(`/api/user/${id}`);
  },

  /**
   * 修改密码
   */
  changePassword: (data: ChangePasswordRequest): Promise<ApiResponse> => {
    return request.post("/api/user/changePassword", data);
  },
};


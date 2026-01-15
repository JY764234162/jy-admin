/**
 * API 响应基础结构
 */
export interface ApiResponse<T = any> {
  code: number;
  data: T;
  msg: string;
}

/**
 * 分页响应结构
 */
export interface PageResult<T = any> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 登录相关类型
 */
export interface LoginRequest {
  username: string;
  password: string;
  code?: string;
  code_id?: string;
}

export interface LoginResponse {
  user: UserInfo;
  token: string;
  expiresAt: number;
}

export interface CaptchaResponse {
  captchaId: string;
  picPath: string;
  captchaLength: number;
  openCaptcha: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickName: string;
  code?: string;
  code_id?: string;
}

/**
 * 用户信息
 */
export interface UserInfo {
  ID: number;
  username: string;
  nickName: string;
  authorityId: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 客户管理相关类型
 */
export interface Customer {
  ID?: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  name?: string;
}

/**
 * 用户管理相关类型
 */
export interface User {
  ID?: number;
  username: string;
  password?: string;
  nickName: string;
  authorityId: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/**
 * 文件管理相关类型
 */
export interface FileInfo {
  ID?: number;
  fileName: string;
  filePath: string;
  fileSize?: number;
  fileType?: string;
  createdAt?: string;
}

export interface FileListParams {
  page?: number;
  pageSize?: number;
  fileName?: string;
}

/**
 * 角色管理相关类型
 */
export interface Authority {
  ID?: number;
  authorityId: number;
  authorityName: string;
  parentId?: number;
  createdAt?: string;
  updatedAt?: string;
}


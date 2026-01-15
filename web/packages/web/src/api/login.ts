import request from "@/utils/request";
import type { ApiResponse, LoginRequest, LoginResponse, CaptchaResponse, RegisterRequest } from "./types";

/**
 * 登录 API
 */
export const loginApi = {
  /**
   * 获取验证码
   */
  getCaptcha: (): Promise<ApiResponse<CaptchaResponse>> => {
    return request.get("/login/captcha");
  },

  /**
   * 用户登录
   */
  login: (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
    return request.post("/login", data);
  },

  /**
   * 用户注册
   */
  register: (data: RegisterRequest): Promise<ApiResponse> => {
    return request.post("/register", data);
  },

  /**
   * 用户登出
   */
  logout: (): Promise<ApiResponse> => {
    return request.post("/logout");
  },
};


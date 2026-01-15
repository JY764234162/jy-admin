import request from "@/utils/request";
import type { ApiResponse, LoginRequest, LoginResponse, CaptchaResponse } from "./types";

/**
 * 登录 API
 */
export const loginApi = {
  /**
   * 获取验证码
   */
  getCaptcha: (): Promise<ApiResponse<CaptchaResponse>> => {
    return request.get("/api/login/captcha");
  },

  /**
   * 用户登录
   */
  login: (data: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
    return request.post("/api/login", data);
  },

  /**
   * 用户登出
   */
  logout: (): Promise<ApiResponse> => {
    return request.post("/api/logout");
  },
};


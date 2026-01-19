import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { localStg } from "./storage";

// API 路径前缀
const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";

// 是否使用代理（通过环境变量配置）
const USE_PROXY = import.meta.env.VITE_USE_PROXY === "true";

// API 基础地址
// 使用代理时：使用相对路径（通过 Vite 代理转发）
// 不使用代理时：使用环境变量配置的完整URL，如果没有则使用当前域名
const BASE_URL = USE_PROXY
  ? "" // 使用代理时使用相对路径，通过 Vite 代理转发
  : import.meta.env.VITE_API_BASE_URL || window.location.origin; // 不使用代理时使用配置的URL或当前域名

// 创建 axios 实例
const service: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}${API_PREFIX}`,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json;charset=UTF-8",
  },
});

const getAuthToken = () => {
  const token = localStg.get("token");
  if (token) {
    return `Bearer ${token}`;
  }
  return null;
};
// 请求拦截器
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从本地存储获取 token
    config.headers.Authorization = getAuthToken();
    return config;
  },
  (error: AxiosError) => {
    console.error("请求错误:", error);
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;

    // 判断 API 是否成功（标准：code === 0 表示成功）
    if (res.code !== undefined && res.code !== 0) {
      window.$message?.error(res.msg || "请求失败");

      // 401: Token 过期或未登录
      if (res.code === 401 || response.status === 401) {
        // 清除 token 和用户信息（只清除 localStorage，避免循环依赖）
        // store 会在重新加载时从 localStorage 读取，如果 token 不存在会自动重置
        localStg.remove("token");
        localStg.remove("userInfo");
        window.location.href = "/login";
      }

      return Promise.reject(new Error(res.msg || "请求失败"));
    }

    return res;
  },
  (error: AxiosError) => {
    console.error("响应错误:", error);

    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401: {
          window.$message?.error("未登录或登录已过期，请重新登录");
          // 清除 token 和用户信息（只清除 localStorage，避免循环依赖）
          // store 会在重新加载时从 localStorage 读取，如果 token 不存在会自动重置
          localStg.remove("token");
          localStg.remove("userInfo");
          window.location.href = "/login";
          break;
        }
        case 403:
          window.$message?.error("没有权限访问该资源");
          break;
        case 404:
          window.$message?.error("请求的资源不存在");
          break;
        case 500:
          window.$message?.error("服务器内部错误");
          break;
        default:
          window.$message?.error((data as any)?.msg || `请求失败: ${status}`);
      }
    } else if (error.request) {
      window.$message?.error("网络错误，请检查网络连接");
    } else {
      window.$message?.error("请求配置错误");
    }

    return Promise.reject(error);
  }
);

export default service;

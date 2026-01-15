import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { message } from "antd";
import { localStg } from "./storage";

// API 基础地址
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:7777";
// API 路径前缀
const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";

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

    // 如果返回的状态码不是 200，说明服务端返回了错误
    if (res.code !== undefined && res.code !== 0) {
      message.error(res.msg || "请求失败");

      // 401: Token 过期或未登录
      if (res.code === 401 || response.status === 401) {
        // 清除 token 并跳转到登录页
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
        case 401:
          message.error("未登录或登录已过期，请重新登录");
          localStg.remove("token");
          localStg.remove("userInfo");
          window.location.href = "/login";
          break;
        case 403:
          message.error("没有权限访问该资源");
          break;
        case 404:
          message.error("请求的资源不存在");
          break;
        case 500:
          message.error("服务器内部错误");
          break;
        default:
          message.error((data as any)?.msg || `请求失败: ${status}`);
      }
    } else if (error.request) {
      message.error("网络错误，请检查网络连接");
    } else {
      message.error("请求配置错误");
    }

    return Promise.reject(error);
  }
);

export default service;

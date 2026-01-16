import request from "@/utils/request";
import type { ApiResponse, FileInfo, FileListParams, PageResult } from "./types";

/**
 * 文件上传 API
 */
export const uploadApi = {
  /**
   * 上传文件
   */
  uploadFile: (file: File, classId?: number): Promise<ApiResponse<FileInfo>> => {
    const formData = new FormData();
    formData.append("file", file);
    if (classId !== undefined) {
      formData.append("classId", classId.toString());
    }
    return request.post("/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  /**
   * 获取文件列表
   */
  getFileList: (params?: FileListParams): Promise<ApiResponse<PageResult<FileInfo>>> => {
    return request.get("/upload/list", { params });
  },

  /**
   * 删除文件
   */
  deleteFile: (data: { key: string }): Promise<ApiResponse> => {
    return request.delete("/upload", { data });
  },
};


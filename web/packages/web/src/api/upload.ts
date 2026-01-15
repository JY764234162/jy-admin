import request from "@/utils/request";
import type { ApiResponse, FileInfo } from "./types";

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
};


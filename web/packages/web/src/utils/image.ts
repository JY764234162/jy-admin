/**
 * 图片URL处理工具
 */

/**
 * 获取图片的完整URL
 * 如果已经是完整URL（http/https开头），直接返回
 * 否则拼接当前域名或配置的API基础路径
 * @param imagePath 图片路径（相对路径或完整URL）
 * @returns 完整的图片URL
 */
export const getImageUrl = (imagePath: string | undefined | null): string | undefined => {
  if (!imagePath) {
    return undefined;
  }

  // 如果已经是完整URL，直接返回
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  // 获取API基础路径
  const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
  
  // 确保路径以 / 开头
  const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  
  // 是否使用代理（通过环境变量配置）
  const USE_PROXY = import.meta.env.VITE_USE_PROXY === "true";
  
  // 使用代理时：使用相对路径（通过 Vite 代理访问）
  // 不使用代理时：使用当前域名拼接完整URL
  if (USE_PROXY) {
    // 使用代理时直接使用相对路径，Vite 代理会自动转发到后端
    return `${API_PREFIX}${normalizedPath}`;
  } else {
    // 不使用代理时使用当前域名
    return `${window.location.origin}${API_PREFIX}${normalizedPath}`;
  }
};

/**
 * 获取图片的相对路径（用于保存到数据库）
 * 如果传入的是完整URL，提取相对路径部分
 * @param imageUrl 图片URL（可能是完整URL或相对路径）
 * @returns 相对路径
 */
export const getImagePath = (imageUrl: string | undefined | null): string | undefined => {
  if (!imageUrl) {
    return undefined;
  }

  // 如果已经是相对路径，直接返回
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // 从完整URL中提取相对路径
  try {
    const url = new URL(imageUrl);
    const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
    let path = url.pathname;
    
    // 移除API前缀（如果存在）
    if (path.startsWith(API_PREFIX)) {
      path = path.substring(API_PREFIX.length);
    }
    
    return path;
  } catch (error) {
    console.error("解析图片URL失败:", error);
    return imageUrl;
  }
};


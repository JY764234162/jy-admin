import path from "path";
import { defineConfig, loadEnv, ConfigEnv } from "vite";
import react from "@vitejs/plugin-react";
import Inspect from "vite-plugin-inspect";
import dynamicImport from "vite-plugin-dynamic-import";
import tailwindcss from "@tailwindcss/vite";
import svgSprite from "vite-plugin-svg-sprite";
import vitePluginResourceClassification from "./custom-vite-plugins/vite-plugin-resource-classification";
import { getBuildTime, setHtmlBuildTimePlugin } from "./custom-vite-plugins/buildTime";
import { setupProjectInfo } from "./custom-vite-plugins/info";
import { visualizer } from "rollup-plugin-visualizer";
// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv) => {
  //加载对应环境的环境变量
  const env = loadEnv(mode, process.cwd(), "");
  const { VITE_BASENAME } = env;
  const buildTime = getBuildTime();

  return {
    plugins: [
      react(),
      Inspect(),
      dynamicImport(),
      vitePluginResourceClassification(),
      svgSprite({ symbolId: "icon-[name]-[hash]" }),
      tailwindcss(),
      visualizer({
        open: false,
        gzipSize: true,
        filename: "bundle-report.html",
      }),
      setHtmlBuildTimePlugin(buildTime),
      setupProjectInfo(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // 避免依赖被打包出多份（尤其是 React 生态）
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      exclude: ["latex.js"],
      // 预构建优化
      include: ["react", "react-dom", "react-router-dom", "antd"],
      // 强制预构建某些大型库
      force: false,
    },
    server: {
      open: true,
      port: 3000,
      hmr: {
        // 配置 HMR 连接
        host: "localhost",
        port: 3000,
      },
      proxy: {
        // 基金数据接口（东方财富），避免浏览器 CORS
        // 注意：必须放在 /api 前面，否则 /api 会先匹配到 /api-fund
        "/api-fund": {
          target: "https://api.fund.eastmoney.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-fund/, ""),
        },

        // 代理 /api 路径到后端服务器
        "/api": {
          target: "http://localhost:7777",
          changeOrigin: true,
          rewrite: (path) => path, // 保持路径不变
          ws: true,
        },
      },
    },
    base: VITE_BASENAME || "/",  // 如果没有设置，默认使用根路径
    assetsInclude: ["**/*.gltf"],
    define: {
      BUILD_TIME: JSON.stringify(buildTime),
    },
    build: {
      manifest: true,
      emptyOutDir: true,
      // 构建产物输出到当前包下的 dist（web/packages/web/dist）
      outDir: "dist",
      // 使用 esbuild 压缩（比 terser 快且资源占用更少）
      minify: "esbuild",
      // 代码分割优化
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "./index.html"),
          404: path.resolve(__dirname, "./404.html"),
        },
        output: {
          // 使用 Vite / Rollup 默认的代码分割策略，避免手动分包导致的循环依赖和运行时初始化顺序问题
        },
        // 限制 Rollup 并发文件操作，降低内存峰值
        maxParallelFileOps: 2,
      },
      // CSS 压缩
      cssMinify: true,
      // 启用 sourcemap（生产环境可以关闭以减小体积）
      sourcemap: false,
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      // 目标浏览器，更现代的浏览器可以减小体积
      target: ["es2015", "edge88", "firefox78", "chrome87", "safari14"],
      // 限制构建并发，避免资源耗尽（4核服务器建议2-3）
      // 减少 chunk 数量，降低内存占用
      chunkSizeWarningLimit: 1000,
      // 优化构建性能
      reportCompressedSize: false, // 禁用压缩大小报告，加快构建
    },
  };
});

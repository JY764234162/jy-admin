export const setupHotModule = () => {
  if (import.meta.hot) {
    // React Fast Refresh 已由 @vitejs/plugin-react 自动处理组件热更新
    // 这里无需手动 accept，避免干扰 Fast Refresh 的正常工作
    import.meta.hot.accept();
  }
};

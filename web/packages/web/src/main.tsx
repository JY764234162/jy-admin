import { createRoot } from "react-dom/client";
import {
  setupConsole,
  setupDayjs,
  setupHotModule,
  setupLoading,
  setupNProgress,
  setupRouter,
  setupAppUpdateNotification,
  setupSentry,
} from "./plugins";
import App from "./App";
import { Provider } from "react-redux";
import { store } from "./store";

async function setupApp() {
  //初始状态loading
  setupLoading();
  //安装全局进度条
  setupNProgress();
  //先获取用户信息和权限路由数据，同时创建路由表
  let router;
  try {
    router = await setupRouter();
  } catch (error) {
    console.error("路由数据初始化失败:", error);
    return;
  }

  //热模块
  setupHotModule();
  //打印
  setupConsole();
  //初始化sentry
  setupSentry();
  //设置国际化
  await setupDayjs();
  //版本更新提示
  setupAppUpdateNotification();

  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(
    <Provider store={store}>
      <App router={router} />
    </Provider>
  );
}

setupApp();

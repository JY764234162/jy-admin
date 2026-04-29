import { createRoot } from "react-dom/client";
import {
  setupConsole,
  setupDayjs,
  setupHotModule,
  setupLoading,
  setupNProgress,
  setupRouter,
  setupAppUpdateNotification,
} from "./plugins";
import App from "./App";
import { Provider } from "react-redux";
import { store } from "./store";

async function setupApp() {
  //初始状态loading
  setupLoading();
  //安装全局进度条
  setupNProgress();
  //先获取用户信息和权限路由数据
  try {
    await setupRouter();
  } catch (error) {
    console.error("路由数据初始化失败:", error);
  }

  // 从 Redux 读取已获取的权限路由，创建完整路由表
  const authRoutes = store.getState().routes.allRoutes;
  const { createAppRouter } = await import("@/router/createAppRouter");
  const router = createAppRouter(authRoutes);

  //热模块
  setupHotModule();
  //打印
  setupConsole();
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

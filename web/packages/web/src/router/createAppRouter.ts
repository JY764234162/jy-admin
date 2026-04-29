import { RouteObject, redirect } from "react-router-dom";
import { constantRoutes } from "./constantRoutes";
import { createRouter, setRouter } from "./routers";
import { transformToReactRoutes } from "@/store/slice/route/shared";
import { localStg } from "@/utils/storage";

/**
 * 根据已获取的权限路由数据创建完整 Router
 * 在 main.tsx 初始化时调用，确保刷新页面时路由表已经完整
 */
export const createAppRouter = (authRoutes: ElegantConstRoute[] = []) => {
  const reactRoutes = transformToReactRoutes(authRoutes);

  const routes: RouteObject[] = [
    ...constantRoutes.filter((r) => r.id !== "layout" && r.id !== "not-found"),
    {
      id: "layout",
      path: "/",
      lazy: () => import("@/Layout").then((m) => ({ Component: m.Layout })),
      children: reactRoutes,
      loader: () => {
        if (!localStg.get("token")) {
          return redirect("/login");
        }
        return true;
      },
    },
    {
      id: "not-found",
      path: "*",
      lazy: () =>
        import("@/components/NotFound").then((m) => ({ Component: m.NotFound })),
      loader: () => {
        if (!localStg.get("token")) {
          return redirect("/login");
        }
        return true;
      },
    },
  ];

  const appRouter = createRouter({
    initRoutes: routes,
    mode: import.meta.env.VITE_ROUTE_MODE,
    opt: { basename: import.meta.env.VITE_BASENAME },
  });

  setRouter(appRouter);
  return appRouter;
};

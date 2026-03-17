import { RouteObject, redirect } from "react-router-dom";
import { localStg } from "@/utils/storage";

//默认路由（Layout/NotFound 懒加载，登录页首屏不加载）
export const constantRoutes: RouteObject[] = [
  {
    id: "login",
    path: "/login",
    lazy: () => import("@/pages/login"),
    loader: () => {
      const token = localStg.get("token");
      if (token) {
        return redirect("/");
      }
      return true;
    },
  },
  {
    id: "register",
    path: "/register",
    lazy: () => import("@/pages/register"),
    loader: () => {
      const token = localStg.get("token");
      if (token) {
        return redirect("/");
      }
      return true;
    },
  },
  {
    id: "layout",
    path: "/",
    lazy: () => import("@/Layout").then((m) => ({ Component: m.Layout })),
    children: [],
    loader: () => {
      const token = localStg.get("token");
      if (!token) {
        return redirect("/login");
      }
      return true;
    },
  },
  {
    id: "not-found",
    path: "*",
    lazy: () => import("@/components/NotFound").then((m) => ({ Component: m.NotFound })),
    loader: () => {
      return redirect("/login");
    },
  },
];

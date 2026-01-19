import { RouteObject, redirect } from "react-router-dom";
import { Layout } from "@/Layout";
import { NotFound } from "@/components/NotFound";
import { localStg } from "@/utils/storage";
//默认路由
export const constantRoutes: RouteObject[] = [
  {
    id: "login",
    path: "/login",
    lazy: () => import("@/pages/login"),
  },
  {
    id: "register",
    path: "/register",
    lazy: () => import("@/pages/register"),
  },
  {
    id: "layout",
    path: "/",
    Component: Layout,
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
    Component: NotFound,
  },
];

import { transformToReactRoutes } from "./shared";
import { authRoutes } from "./../../../router/constantRoutes";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ThunkAction } from "@reduxjs/toolkit";
import type { Action } from "@reduxjs/toolkit";
import { router } from "@/router/routers";
import { convertMenusToRoutes } from "@/utils/menuToRoute";
import { message } from "antd";
import { AppThunk } from "@/store";

const initialState: { allRoutes: ElegantConstRoute[]; constantRoutes: ElegantConstRoute[]; authRoutes: ElegantConstRoute[] } = {
  constantRoutes: [],
  authRoutes: [],
  allRoutes: [],
};

export const routesSlice = createSlice({
  name: "routes",
  initialState,
  reducers: {
    setAllRoute(state, { payload }: PayloadAction<ElegantConstRoute[]>) {
      state.allRoutes = payload;
    },
    // 重置路由到初始状态
    resetRoutes(state) {
      state.allRoutes = [];
    },
  },
  selectors: {
    getAllRoute: (state) => state.allRoutes,
  },
});

//路由 - 从后端获取菜单并初始化路由
export const initConstantRoute = (): AppThunk => async (dispatch, getState) => {
  try {
    // 延迟导入 authorityApi，避免循环依赖
    const { authorityApi } = await import("@/api");
    // 从后端获取当前用户的菜单权限（从token中解析角色ID）
    const res = await authorityApi.getAuthorityMenus();

    if (res.code === 0 && res.data && res.data.length > 0) {
      // 将菜单数据转换为路由格式（后端已返回树状结构）
      const routes = convertMenusToRoutes(res.data);
      const reactRoutes = transformToReactRoutes(routes);

      // 更新路由
      await router.patchRoutes("layout", reactRoutes);
      await dispatch(routesSlice.actions.setAllRoute(routes));
    } else {
      // 如果没有菜单权限，使用默认路由（降级处理）
      console.warn("用户没有菜单权限，使用默认路由", res);
      const routes = transformToReactRoutes(authRoutes);
      await router.patchRoutes("layout", routes);
      await dispatch(routesSlice.actions.setAllRoute(authRoutes));
    }
  } catch (error: any) {
    console.error("初始化路由失败:", error);
    // 出错时使用默认路由（降级处理）
    message.warning("获取菜单权限失败，使用默认路由");
    const routes = transformToReactRoutes(authRoutes);
    await router.patchRoutes("layout", routes);
    await dispatch(routesSlice.actions.setAllRoute(authRoutes));
  }
};

// 重置路由（退出登录时调用）
export const resetRoutes = (): AppThunk => async (dispatch) => {
  // 重置路由到空数组
  const emptyRoutes = transformToReactRoutes([]);
  await router.patchRoutes("layout", emptyRoutes);
  await dispatch(routesSlice.actions.resetRoutes());
};

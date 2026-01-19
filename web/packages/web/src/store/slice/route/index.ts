import { transformToReactRoutes } from "./shared";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { router } from "@/router/routers";
import { convertMenusToRoutes } from "@/utils/menuToRoute";
import { AppThunk } from "@/store";
import { constantRoutes } from "@/router/constantRoutes";

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
export const initConstantRoute = (): AppThunk => async (dispatch) => {
  try {
    // 延迟导入 authorityApi，避免循环依赖
    const { authorityApi } = await import("@/api");
    // 从后端获取当前用户的菜单权限（从token中解析角色ID）
    const res = await authorityApi.getAuthorityMenus();

    if (res.code === 0) {
      // 将菜单数据转换为路由格式（后端已返回树状结构）
      const routes = convertMenusToRoutes(res.data);
      const reactRoutes = transformToReactRoutes(routes);

      // 更新路由
      await router.patchRoutes("layout", reactRoutes);
      await dispatch(routesSlice.actions.setAllRoute(routes));
    }
  } catch (error: any) {
    console.error("初始化路由失败:", error);
  }
};


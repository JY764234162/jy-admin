import { store } from "@/store";
import { localStg } from "@/utils/storage";
import { initConstantRoute } from "@/store/slice/route";
import { getCurrentUserInfo } from "@/store/slice/user";

export const setupRouter = async () => {
  const token = localStg.get("token");
  if (token) {
    await store.dispatch(getCurrentUserInfo());
    await store.dispatch(initConstantRoute());
  }

  const authRoutes = store.getState().routes.allRoutes;
  const { createAppRouter } = await import("@/router/createAppRouter");
  return createAppRouter(authRoutes);
};

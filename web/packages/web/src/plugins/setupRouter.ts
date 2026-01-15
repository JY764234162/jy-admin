import { router } from "@/router/routers";
import { store } from "@/store";
import { localStg } from "@/utils/storage";
import { initConstantRoute } from "@/store/slice/route";

export const setupRouter = async () => {
  await router.initialize();
  const token = localStg.get("token");
  if (token) {
    await store.dispatch(initConstantRoute());
  }
};

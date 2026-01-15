import { router } from "@/router/routers";
import { store } from "@/store";

export const setupRouter = async () => {
  await router.initialize();
};

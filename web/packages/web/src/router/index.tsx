import { RouterProvider } from "react-router-dom";
import { AppLoading } from "@/components/AppLoading";

export default function Router({ router }: { router: any }) {
  return <RouterProvider router={router} fallbackElement={<AppLoading />} />;
}

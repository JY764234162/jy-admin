import { createRoot } from "react-dom/client";
import { AppLoading } from "@/components/AppLoading";

export function setupLoading() {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    root.render(<AppLoading />);
  }
}

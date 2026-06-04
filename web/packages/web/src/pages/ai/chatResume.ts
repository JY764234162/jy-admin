import type { AIMessage } from "@/api/aiApi";
import type { UiMessage } from "./types";

/** 判断刷新后是否需要自动续接 SSE */
export function shouldAutoResume(
  apiNewest: AIMessage,
  convStillLoading: boolean
): boolean {
  const apiIsAssistant = apiNewest.role === "assistant";

  return (
    (apiIsAssistant && apiNewest.status === "loading") ||
    (convStillLoading && apiIsAssistant) ||
    (convStillLoading && apiNewest.role === "user")
  );
}

/** 在展示列表中定位可续接的 AI 消息 */
export function findResumeAiMessage(
  displayList: UiMessage[],
  apiNewest: AIMessage
): UiMessage | null {
  const mappedId = `msg-${apiNewest.ID}`;

  return (
    displayList.find((m) => m.id === mappedId && m.role === "ai") ??
    displayList.find((m) => m.role === "ai" && m.status === "loading") ??
    null
  );
}

/** 创建续接用的 loading AI 占位消息 */
export function createResumeAiPlaceholder(): UiMessage {
  return {
    id: `ai-resume-${Date.now()}`,
    content: "",
    role: "ai",
    status: "loading",
    timestamp: Date.now(),
  };
}

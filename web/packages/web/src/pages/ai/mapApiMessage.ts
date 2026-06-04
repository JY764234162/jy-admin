import type { AIMessage } from "@/api/aiApi";
import { normalizeMessageContent } from "./messageContent";
import type { UiMessage } from "./types";

function parseAttachments(raw: string | undefined): UiMessage["attachments"] {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as UiMessage["attachments"];
  } catch {
    return undefined;
  }
}

function mapApiStatus(status: AIMessage["status"]): UiMessage["status"] {
  if (status === "error") return "error";
  if (status === "loading") return "loading";
  return "success";
}

/** 将接口消息转为 UI 展示顺序（接口最新在前，展示时 reverse 后最新在末尾） */
export function apiMessagesToUi(list: AIMessage[]): UiMessage[] {
  return [...list].reverse().map((msg) => ({
    id: `msg-${msg.ID}`,
    content: normalizeMessageContent(msg.content),
    role: msg.role === "user" ? "user" : "ai",
    status: mapApiStatus(msg.status),
    timestamp: new Date(msg.createdAt).getTime(),
    attachments: parseAttachments(msg.attachments),
  }));
}

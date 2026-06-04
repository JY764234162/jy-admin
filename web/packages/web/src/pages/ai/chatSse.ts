import { localStg } from "@/utils/storage";

/** SSE data 行解析后的 payload */
export interface ChatSsePayload {
  content?: string;
  isFull?: boolean;
  done?: boolean;
  error?: string;
}

export interface ChatSseHandlers {
  onContent: (content: string, isFull: boolean) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

/** 构建 chat / resume 接口 URL */
export function buildChatUrl(resume = false): string {
  const aiServerUrl = import.meta.env.VITE_AI_SERVER_URL || "";
  const suffix = resume ? "/resume" : "";

  if (aiServerUrl) {
    return `${aiServerUrl}/api/ai/chat${suffix}`;
  }

  const base = `${import.meta.env.VITE_API_BASE_URL || ""}${import.meta.env.VITE_API_PREFIX || "/api"}`;
  return `${base}/ai/chat${suffix}`;
}

function parseSseDataLine(line: string): ChatSsePayload | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const data = trimmed.replace(/^data:\s?/, "");
  if (!data) return null;

  try {
    return JSON.parse(data) as ChatSsePayload;
  } catch {
    return null;
  }
}

/** 读取 SSE 流并按事件回调 */
export async function readSseStream(
  url: string,
  body: Record<string, unknown>,
  handlers: ChatSseHandlers,
  signal: AbortSignal
): Promise<void> {
  const token = localStg.get("token");

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      handlers.onError(text || `HTTP ${resp.status}`);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        for (const line of rawEvent.split("\n")) {
          const parsed = parseSseDataLine(line);
          if (!parsed) continue;

          if (parsed.error) {
            handlers.onError(parsed.error);
            return;
          }
          if (parsed.content != null) {
            handlers.onContent(parsed.content, !!parsed.isFull);
          }
          if (parsed.done) {
            handlers.onDone();
            return;
          }
        }
      }
    }

    handlers.onDone();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return;
    const message = e instanceof Error ? e.message : String(e);
    handlers.onError(message);
  }
}

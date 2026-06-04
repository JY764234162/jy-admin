/** 将 API / Checkpoint 可能返回的多模态 content 规范为可渲染字符串 */

type ContentPart = { type?: string; text?: string };

export function normalizeMessageContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const part = item as ContentPart;
          if (part.type === "text" || part.text != null) {
            return String(part.text ?? "");
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object" && content !== null && "text" in content) {
    return String((content as ContentPart).text ?? "");
  }
  return String(content);
}

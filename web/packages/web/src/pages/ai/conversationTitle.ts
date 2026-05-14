const MAX_LEN = 48;

/** 用首条用户消息的第一行作为会话标题（与常见 AI 产品一致） */
export function conversationTitleFromFirstMessage(content: string): string {
  const line = content.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return "新对话";
  return line.length > MAX_LEN ? `${line.slice(0, MAX_LEN)}…` : line;
}

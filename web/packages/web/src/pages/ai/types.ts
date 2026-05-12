export type ChatMode = "aiserver_chat" | "aiserver_knowledge";

export interface UiMessage {
  id: string;
  content: string;
  role: "user" | "ai";
  status?: "loading" | "success" | "error";
  timestamp: number;
}

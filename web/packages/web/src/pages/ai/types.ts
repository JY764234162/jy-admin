export interface MessageAttachment {
  uid: string;
  filename: string;
  url?: string;
}

export interface UiMessage {
  id: string;
  content: string;
  role: "user" | "ai";
  status?: "loading" | "success" | "error";
  timestamp: number;
  /** 用户消息携带的附件 */
  attachments?: MessageAttachment[];
}

/** 发送消息选项（避免记参数顺序） */
export interface SendOptions {
  content: string;
  useKnowledge?: boolean;
  targetConversationId?: number;
  resume?: boolean;
  imageBase64?: string;
  docIds?: string[];
  attachments?: MessageAttachment[];
}

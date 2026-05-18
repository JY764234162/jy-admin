export type ChatMode = "aiserver_chat" | "aiserver_knowledge" | "aiserver_vision" | "aiserver_attachment";

export interface ProcessStep {
  step_id: string;
  status: "processing" | "successful" | "failed";
  message: string;
  description: string;
}

export interface ThinkingProcess {
  plan: {
    status: "processing" | "successful" | "failed";
    message: string;
  };
  step: {
    status: "processing" | "successful" | "failed";
    processes: ProcessStep[];
    source: unknown[];
  };
  task_status: "processing" | "successful" | "failed";
}

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
  /** AI 思考过程 */
  thinkingProcess?: ThinkingProcess;
  /** 思考过程状态 */
  thinkingStatus?: "processing" | "successful" | "failed";
  /** 知识库检索/生成等阶段状态 */
  stepStatus?: string;
  /** 用户消息携带的附件 */
  attachments?: MessageAttachment[];
}

/** 发送消息选项（避免记参数顺序） */
export interface SendOptions {
  content: string;
  useKnowledge?: boolean;
  deepThink?: boolean;
  targetConversationId?: number;
  resume?: boolean;
  imageBase64?: string;
  docIds?: string[];
  attachments?: MessageAttachment[];
}

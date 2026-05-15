export type ChatMode = "aiserver_chat" | "aiserver_knowledge";

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
}

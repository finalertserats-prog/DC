export interface Conversation {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  preview?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  ts?: string;
}

export type SupportChatMessageRole = 'assistant' | 'user';
export type SupportChatHistoryRole = 'ASSISTANT' | 'USER';

export interface SupportChatMessageModel {
  id: string;
  role: SupportChatMessageRole;
  content: string;
  createdAt: string;
  suggestions?: string[];
}

export interface SupportChatHistoryMessagePayload {
  role: SupportChatHistoryRole;
  content: string;
}

export interface SupportChatRequestPayload {
  conversationId?: string | null;
  message: string;
  sourcePage?: string | null;
  locale?: string | null;
  history?: SupportChatHistoryMessagePayload[];
}

export interface SupportChatResponseModel {
  conversationId: string;
  assistantName: string;
  message: string;
  generatedAt: string;
  suggestions: string[];
}

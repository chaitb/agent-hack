export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageSource = "cli" | "web" | "telegram" | "email" | "heartbeat" | "task";

export interface Message {
	id: string;
	role: MessageRole;
	content: string;
	source: MessageSource;
	metadata?: Record<string, unknown>;
	created_at: Date;
}

export type ChatMessage = Pick<Message, "id" | "role" | "content" | "source">;

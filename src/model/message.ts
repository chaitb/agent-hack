export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageSource =
	| "cli"
	| "telegram"
	| "email"
	| "heartbeat"
	| "task";

export interface Message {
	id: string;
	role: MessageRole;
	content: string;
	source: MessageSource;
	metadata?: Record<string, unknown>;
	created_at: Date;
}

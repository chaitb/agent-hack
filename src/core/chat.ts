import type { DB } from "../persistence/database";
import type { Agent } from "./agent";
import type { Message, MessageRole, MessageSource } from "./model";

export type ChatMessage = Pick<Message, "id" | "role" | "content" | "source">;

function isChatRole(role: MessageRole): role is "user" | "assistant" | "system" {
	return role === "user" || role === "assistant" || role === "system";
}

export function toChatMessage(message: Message): ChatMessage | null {
	if (!isChatRole(message.role) || !message.content) {
		return null;
	}

	return {
		id: message.id,
		role: message.role,
		content: message.content,
		source: message.source,
	};
}

export class ChatService {
	constructor(
		private readonly db: DB,
		private readonly agent: Agent,
	) {}

	async getRecentMessages(limit = 20): Promise<ChatMessage[]> {
		const recent = await this.db.getRecentMessages(limit);
		return recent.map(toChatMessage).filter((message): message is ChatMessage => Boolean(message));
	}

	streamReply(input: string, source: MessageSource): AsyncGenerator<string> {
		return this.agent.stream(input, source);
	}
}

import type { Client } from "@libsql/client";
import type { Message, MessageRole, MessageSource } from "../../core/model";

export async function insertMessage(client: Client, message: Message): Promise<void> {
	await client.execute({
		sql: `INSERT INTO messages (id, role, content, source, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		args: [
			message.id,
			message.role,
			message.content,
			message.source,
			message.metadata ? JSON.stringify(message.metadata) : null,
			message.created_at.toISOString(),
		],
	});
}

export async function updateMessageContent(
	client: Client,
	id: string,
	content: string,
): Promise<void> {
	await client.execute({
		sql: `UPDATE messages SET content = ? WHERE id = ?`,
		args: [content, id],
	});
}

export async function getMessageRoleAndSource(
	client: Client,
	id: string,
): Promise<{ role: MessageRole; source: MessageSource } | null> {
	const result = await client.execute({
		sql: `SELECT role, source FROM messages WHERE id = ?`,
		args: [id],
	});
	if (result.rows.length === 0) {
		return null;
	}

	return {
		role: result.rows[0]?.role as MessageRole,
		source: result.rows[0]?.source as MessageSource,
	};
}

export async function listRecentMessages(client: Client, limit = 20): Promise<Message[]> {
	const result = await client.execute({
		sql: `SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`,
		args: [limit],
	});

	return result.rows.reverse().map(rowToMessage);
}

export async function hasMessageWithMetadata(
	client: Client,
	key: string,
	value: string | number,
): Promise<boolean> {
	const result = await client.execute({
		sql: `SELECT 1 FROM messages WHERE json_extract(metadata, ?) = ? LIMIT 1`,
		args: [`$.${key}`, String(value)],
	});

	return result.rows.length > 0;
}

export async function clearMessages(client: Client): Promise<void> {
	await client.execute("DELETE FROM messages");
}

function rowToMessage(row: Record<string, unknown>): Message {
	return {
		id: row.id as string,
		role: row.role as MessageRole,
		content: row.content as string,
		source: row.source as MessageSource,
		metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
		created_at: new Date(row.created_at as string),
	};
}

import type { Client } from "@libsql/client";
import type { InstructionRecord } from "../../core/model";

export async function upsertInstruction(
	client: Client,
	params: { id: string; filename: string; description: string; updated_at: string },
): Promise<void> {
	await client.execute({
		sql: `INSERT INTO instructions (id, filename, description, updated_at) VALUES (?, ?, ?, ?)
		      ON CONFLICT(filename) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`,
		args: [params.id, params.filename, params.description, params.updated_at],
	});
}

export async function listInstructions(client: Client): Promise<InstructionRecord[]> {
	const result = await client.execute(`SELECT * FROM instructions ORDER BY filename`);
	return result.rows.map((row) => ({
		id: row.id as string,
		filename: row.filename as string,
		description: row.description as string,
		updated_at: new Date(row.updated_at as string),
	}));
}

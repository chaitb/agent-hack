import type { Client } from "@libsql/client";
import type { ToolUsage } from "../../core/model";

export async function insertToolUsage(
	client: Client,
	params: {
		id: string;
		message_id?: string | null;
		namespace: string;
		name: string;
		input: Record<string, unknown>;
		result: ToolUsage["result"];
		output?: unknown;
		error?: string | null;
		duration_ms: number;
		created_at: string;
	},
): Promise<void> {
	await client.execute({
		sql: `INSERT INTO tool_usage (id, message_id, namespace, name, input, result, output, error, duration_ms, created_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			params.id,
			params.message_id ?? null,
			params.namespace,
			params.name,
			JSON.stringify(params.input),
			params.result,
			params.output ? JSON.stringify(params.output) : null,
			params.error ?? null,
			params.duration_ms,
			params.created_at,
		],
	});
}

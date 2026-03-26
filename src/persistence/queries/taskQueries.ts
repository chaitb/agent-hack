import type { Client } from "@libsql/client";
import type { Task, TaskStatus } from "../../core/model";

export async function insertTask(
	client: Client,
	params: {
		id: string;
		title: string;
		description: string;
		priority: number;
		scheduled_at?: string | null;
		recurrence?: string | null;
		created_at: string;
		updated_at: string;
	},
): Promise<void> {
	await client.execute({
		sql: `INSERT INTO tasks (id, title, description, status, priority, scheduled_at, recurrence, created_at, updated_at)
		      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
		args: [
			params.id,
			params.title,
			params.description,
			params.priority,
			params.scheduled_at ?? null,
			params.recurrence ?? null,
			params.created_at,
			params.updated_at,
		],
	});
}

export async function getTaskById(client: Client, id: string): Promise<Task | null> {
	const result = await client.execute({
		sql: `SELECT * FROM tasks WHERE id = ?`,
		args: [id],
	});

	if (result.rows.length === 0) {
		return null;
	}

	return rowToTask(result.rows[0]!);
}

export async function listTasks(
	client: Client,
	filter?: { status?: TaskStatus; limit?: number },
): Promise<Task[]> {
	let sql = `SELECT * FROM tasks`;
	const args: (string | number)[] = [];
	if (filter?.status) {
		sql += ` WHERE status = ?`;
		args.push(filter.status);
	}
	sql += ` ORDER BY priority DESC, scheduled_at ASC`;
	if (filter?.limit) {
		sql += ` LIMIT ?`;
		args.push(filter.limit);
	}

	const result = await client.execute({ sql, args });
	return result.rows.map(rowToTask);
}

export async function listDueTasks(client: Client, now: string): Promise<Task[]> {
	const result = await client.execute({
		sql: `SELECT * FROM tasks WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY priority DESC`,
		args: [now],
	});

	return result.rows.map(rowToTask);
}

export async function updateTaskById(
	client: Client,
	id: string,
	updates: Partial<
		Pick<
			Task,
			| "title"
			| "description"
			| "status"
			| "priority"
			| "scheduled_at"
			| "recurrence"
			| "last_run_at"
			| "result"
		>
	>,
	updatedAt: string,
): Promise<void> {
	const sets: string[] = [];
	const args: (string | number | null)[] = [];

	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) {
			sets.push(`${key} = ?`);
			args.push(value instanceof Date ? value.toISOString() : (value as string | number | null));
		}
	}

	if (sets.length === 0) {
		return;
	}

	sets.push("updated_at = ?");
	args.push(updatedAt);
	args.push(id);

	await client.execute({
		sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
		args,
	});
}

function rowToTask(row: Record<string, unknown>): Task {
	return {
		id: row.id as string,
		title: row.title as string,
		description: row.description as string,
		status: row.status as TaskStatus,
		priority: row.priority as number,
		scheduled_at: row.scheduled_at ? new Date(row.scheduled_at as string) : null,
		recurrence: row.recurrence as string | null,
		last_run_at: row.last_run_at ? new Date(row.last_run_at as string) : null,
		result: row.result as string | null,
		created_at: new Date(row.created_at as string),
		updated_at: new Date(row.updated_at as string),
	};
}

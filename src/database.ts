import { randomUUID } from "node:crypto";
import { type Client, createClient } from "@libsql/client";
import { buildEmbeddingText, vectorToSql } from "./embeddings";
import { chatBus } from "./logger";
import type {
	InstructionRecord,
	Memory,
	MemoryCategory,
	Message,
	MessageRole,
	MessageSource,
	ScoredMemory,
	Task,
	TaskStatus,
	ToolResult,
	ToolUsage,
} from "./model";

// Re-export all model types so existing `import from "./memory"` still works
export type {
	InstructionRecord,
	Memory,
	MemoryCategory,
	Message,
	MessageRole,
	MessageSource,
	ScoredMemory,
	Task,
	TaskStatus,
	ToolResult,
	ToolUsage,
} from "./model";

// ─── Database Layer ──────────────────────────────────────────────────────────

export class DB {
	private client: Client;

	/**
	 * The message ID of the current user message being processed.
	 * Set by Agent before each run so tool_usage records can link back.
	 */
	currentMessageId: string | null = null;

	constructor() {
		const url = process.env.TURSO_CONNECTION_URL;
		const authToken = process.env.TURSO_AUTH_TOKEN;
		if (!url) throw new Error("TURSO_CONNECTION_URL is required");
		this.client = createClient({ url, authToken });
	}

	async initialize({ drop = false }: { drop?: boolean }): Promise<void> {
		// Drop old tables and recreate with new schema (dev mode)
		const maybeDropTables = drop
			? `
			DROP TABLE IF EXISTS tool_usage;
			DROP TABLE IF EXISTS messages;
			DROP TABLE IF EXISTS memory;
			DROP TABLE IF EXISTS tasks;
			DROP TABLE IF EXISTS instructions;
		`
			: "";

		await this.client.executeMultiple(`
			${maybeDropTables}

			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				source TEXT NOT NULL DEFAULT 'cli',
				metadata TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS memory (
				id TEXT PRIMARY KEY,
				key TEXT NOT NULL UNIQUE,
				value TEXT NOT NULL,
				category TEXT NOT NULL DEFAULT 'fact',
				embedding F32_BLOB(1024),
				access_count INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS tasks (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'pending',
				priority INTEGER NOT NULL DEFAULT 5,
				scheduled_at DATETIME,
				recurrence TEXT,
				last_run_at DATETIME,
				result TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS instructions (
				id TEXT PRIMARY KEY,
				filename TEXT NOT NULL UNIQUE,
				description TEXT NOT NULL DEFAULT '',
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS tool_usage (
				id TEXT PRIMARY KEY,
				message_id TEXT,
				namespace TEXT NOT NULL,
				name TEXT NOT NULL,
				input TEXT,
				result TEXT NOT NULL DEFAULT 'success',
				output TEXT,
				error TEXT,
				duration_ms INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (message_id) REFERENCES messages(id)
			);
		`);

		// Idempotent migrations for existing DBs
		const migrations = [
			`ALTER TABLE memory ADD COLUMN embedding F32_BLOB(1024)`,
			`ALTER TABLE memory ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
			`ALTER TABLE memory ADD COLUMN access_count INTEGER DEFAULT 0`,
			// Rebuild FTS5 table + triggers to add the category column.
			// DROP first so the IF NOT EXISTS below recreates them with the new schema.
			`DROP TRIGGER IF EXISTS memory_au`,
			`DROP TRIGGER IF EXISTS memory_ad`,
			`DROP TRIGGER IF EXISTS memory_ai`,
			`DROP TABLE IF EXISTS memory_fts`,
		];
		for (const sql of migrations) {
			try {
				await this.client.execute(sql);
			} catch {
				// column already exists
			}
		}

		// FTS5 virtual table for BM25 keyword search (key, value, category indexed)
		await this.client.executeMultiple(`
			CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
				USING fts5(key, value, category, content=memory, content_rowid=rowid);

			CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
				INSERT INTO memory_fts(rowid, key, value, category) VALUES (new.rowid, new.key, new.value, new.category);
			END;

			CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
				INSERT INTO memory_fts(memory_fts, rowid, key, value, category) VALUES ('delete', old.rowid, old.key, old.value, old.category);
			END;

			CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
				INSERT INTO memory_fts(memory_fts, rowid, key, value, category) VALUES ('delete', old.rowid, old.key, old.value, old.category);
				INSERT INTO memory_fts(rowid, key, value, category) VALUES (new.rowid, new.key, new.value, new.category);
			END;
		`);
	}

	// ─── Messages ──────────────────────────────────────────────────────────

	/**
	 * Save a message to the DB and emit it on the chatBus so all
	 * UI surfaces (CLI, etc.) update in real time.
	 */
	async saveMessage(
		role: MessageRole,
		content: string,
		source: MessageSource = "cli",
		metadata?: Record<string, unknown>,
	): Promise<Message> {
		const msg: Message = {
			id: randomUUID(),
			role,
			content,
			source,
			metadata,
			created_at: new Date(),
		};
		await this.client.execute({
			sql: `INSERT INTO messages (id, role, content, source, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				msg.id,
				msg.role,
				msg.content,
				msg.source,
				metadata ? JSON.stringify(metadata) : null,
				msg.created_at.toISOString(),
			],
		});

		// Emit to chatBus so CLI and other UIs pick it up.
		// Skip empty content (assistant placeholders created for tool_usage FK).
		if ((role === "user" || role === "assistant") && content) {
			chatBus.push({
				id: msg.id,
				role,
				content,
				source,
			});
		}

		return msg;
	}

	/**
	 * Update an existing message's content. Used to fill in the assistant's
	 * response after streaming completes (the placeholder is created before
	 * tools run so tool_usage can link to it).
	 */
	async updateMessageContent(id: string, content: string): Promise<void> {
		await this.client.execute({
			sql: `UPDATE messages SET content = ? WHERE id = ?`,
			args: [content, id],
		});

		// Emit the final content on chatBus
		const result = await this.client.execute({
			sql: `SELECT role, source FROM messages WHERE id = ?`,
			args: [id],
		});
		if (result.rows.length > 0) {
			const row = result.rows[0]!;
			const role = row.role as MessageRole;
			if (role === "user" || role === "assistant") {
				chatBus.push({
					id,
					role,
					content,
					source: row.source as string,
				});
			}
		}
	}

	async getRecentMessages(limit = 20): Promise<Message[]> {
		const result = await this.client.execute({
			sql: `SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`,
			args: [limit],
		});
		return result.rows.reverse().map(rowToMessage);
	}

	async hasMessageWithMetadata(
		key: string,
		value: string | number,
	): Promise<boolean> {
		const result = await this.client.execute({
			sql: `SELECT 1 FROM messages WHERE json_extract(metadata, ?) = ? LIMIT 1`,
			args: [`$.${key}`, String(value)],
		});
		return result.rows.length > 0;
	}

	async clearMessages(): Promise<void> {
		await this.client.execute("DELETE FROM messages");
	}

	async clearAllData(): Promise<void> {
		await this.client.executeMultiple(`
      DELETE FROM tool_usage;
      DELETE FROM instructions;
      DELETE FROM tasks;
      DELETE FROM memory;
      DELETE FROM messages;
    `);
	}

	// ─── Memory ────────────────────────────────────────────────────────────

	async remember(
		key: string,
		value: string,
		category: MemoryCategory = "fact",
		embedding?: number[],
	): Promise<void> {
		const id = randomUUID();
		const now = new Date().toISOString();
		if (embedding) {
			await this.client.execute({
				sql: `INSERT INTO memory (id, key, value, category, embedding, updated_at)
				      VALUES (?, ?, ?, ?, vector(?), ?)
				      ON CONFLICT(key) DO UPDATE SET
				        value = excluded.value,
				        category = excluded.category,
				        embedding = excluded.embedding,
				        updated_at = excluded.updated_at`,
				args: [id, key, value, category, vectorToSql(embedding), now],
			});
		} else {
			await this.client.execute({
				sql: `INSERT INTO memory (id, key, value, category, updated_at)
				      VALUES (?, ?, ?, ?, ?)
				      ON CONFLICT(key) DO UPDATE SET
				        value = excluded.value,
				        category = excluded.category,
				        updated_at = excluded.updated_at`,
				args: [id, key, value, category, now],
			});
		}
	}

	async recall(key: string): Promise<string | null> {
		// Increment access_count on hit
		const result = await this.client.execute({
			sql: `UPDATE memory SET access_count = access_count + 1
			      WHERE key = ? RETURNING value`,
			args: [key],
		});
		if (result.rows.length === 0) return null;
		return result.rows[0]!.value as string;
	}

	async forget(key: string): Promise<boolean> {
		const result = await this.client.execute({
			sql: `DELETE FROM memory WHERE key = ?`,
			args: [key],
		});
		return result.rowsAffected > 0;
	}

	async getAllMemories(): Promise<Memory[]> {
		const result = await this.client.execute(
			`SELECT * FROM memory ORDER BY updated_at DESC`,
		);
		return result.rows.map(rowToMemory);
	}

	async getMemoriesByCategory(
		category: MemoryCategory,
		limit?: number,
	): Promise<Memory[]> {
		let sql = `SELECT * FROM memory WHERE category = ? ORDER BY updated_at DESC`;
		const args: (string | number)[] = [category];
		if (limit) {
			sql += ` LIMIT ?`;
			args.push(limit);
		}
		const result = await this.client.execute({ sql, args });
		return result.rows.map(rowToMemory);
	}

	async vectorSearch(
		queryEmbedding: number[],
		limit = 10,
		category?: MemoryCategory,
	): Promise<ScoredMemory[]> {
		const vecStr = vectorToSql(queryEmbedding);
		let sql = `SELECT *, vector_distance_cos(embedding, vector(?)) AS distance
		           FROM memory WHERE embedding IS NOT NULL`;
		const args: (string | number)[] = [vecStr];
		if (category) {
			sql += ` AND category = ?`;
			args.push(category);
		}
		sql += ` ORDER BY distance ASC LIMIT ?`;
		args.push(limit);
		const result = await this.client.execute({ sql, args });
		return result.rows.map((row) => ({
			...rowToMemory(row),
			// cosine distance → similarity: 1 - distance (lower distance = more similar)
			score: 1 - ((row.distance as number) ?? 1),
		}));
	}

	async bm25Search(
		query: string,
		limit = 10,
		category?: MemoryCategory,
	): Promise<ScoredMemory[]> {
		let sql = `SELECT m.*, bm25(memory_fts) AS rank
			      FROM memory_fts f
			      JOIN memory m ON m.rowid = f.rowid
			      WHERE memory_fts MATCH ?`;
		const args: (string | number)[] = [query];
		if (category) {
			sql += ` AND m.category = ?`;
			args.push(category);
		}
		sql += ` ORDER BY rank LIMIT ?`;
		args.push(limit);
		const result = await this.client.execute({ sql, args });
		return result.rows.map((row) => ({
			...rowToMemory(row),
			// BM25 returns negative scores (lower = better), normalize to 0-1
			score: Math.max(0, 1 + (row.rank as number) * 0.1),
		}));
	}

	/**
	 * Hybrid search: 70% vector similarity + 30% BM25 keyword, de-duped and re-ranked.
	 */
	async hybridSearch(
		query: string,
		queryEmbedding: number[],
		limit = 10,
		category?: MemoryCategory,
	): Promise<ScoredMemory[]> {
		// Run both searches in parallel
		const [vectorResults, bm25Results] = await Promise.all([
			this.vectorSearch(queryEmbedding, limit * 2, category),
			this.bm25Search(query, limit * 2, category),
		]);

		// Merge and de-duplicate by key
		const scoreMap = new Map<string, { memory: Memory; score: number }>();

		for (const r of vectorResults) {
			scoreMap.set(r.key, {
				memory: r,
				score: r.score * 0.7, // 70% weight
			});
		}

		for (const r of bm25Results) {
			const existing = scoreMap.get(r.key);
			if (existing) {
				existing.score += r.score * 0.3; // add 30% BM25 weight
			} else {
				scoreMap.set(r.key, {
					memory: r,
					score: r.score * 0.3,
				});
			}
		}

		// Sort by combined score descending, return top N
		return Array.from(scoreMap.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map(({ memory, score }) => ({ ...memory, score }));
	}

	/**
	 * Backfill embeddings for memories that don't have them.
	 * Call with an embedding function to avoid circular imports.
	 */
	async backfillEmbeddings(
		embedFn: (text: string) => Promise<number[]>,
		onProgress?: (completed: number, total: number, key: string) => void,
	): Promise<number> {
		const result = await this.client.execute(
			`SELECT id, key, value, category FROM memory WHERE embedding IS NULL`,
		);
		return this.reindexRows(result.rows, embedFn, onProgress);
	}

	async reindexAllEmbeddings(
		embedFn: (text: string) => Promise<number[]>,
		onProgress?: (completed: number, total: number, key: string) => void,
	): Promise<number> {
		const result = await this.client.execute(
			`SELECT id, key, value, category FROM memory`,
		);
		return this.reindexRows(result.rows, embedFn, onProgress);
	}

	private async reindexRows(
		rows: { [column: string]: unknown }[],
		embedFn: (text: string) => Promise<number[]>,
		onProgress?: (completed: number, total: number, key: string) => void,
	): Promise<number> {
		const total = rows.length;
		let count = 0;
		for (const row of rows) {
			const text = buildEmbeddingText(
				row.key as string,
				row.value as string,
				row.category as string,
			);
			const embedding = await embedFn(text);
			await this.client.execute({
				sql: `UPDATE memory SET embedding = vector(?) WHERE id = ?`,
				args: [vectorToSql(embedding), row.id as string],
			});
			count++;
			onProgress?.(count, total, row.key as string);
		}
		return count;
	}

	// ─── Tasks ─────────────────────────────────────────────────────────────

	async createTask(params: {
		title: string;
		description?: string;
		priority?: number;
		scheduled_at?: string | null;
		recurrence?: string | null;
	}): Promise<Task> {
		const id = randomUUID();
		const now = new Date().toISOString();
		await this.client.execute({
			sql: `INSERT INTO tasks (id, title, description, status, priority, scheduled_at, recurrence, created_at, updated_at)
			      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
			args: [
				id,
				params.title,
				params.description ?? "",
				params.priority ?? 5,
				params.scheduled_at ?? null,
				params.recurrence ?? null,
				now,
				now,
			],
		});
		return (await this.getTask(id))!;
	}

	async getTask(id: string): Promise<Task | null> {
		const result = await this.client.execute({
			sql: `SELECT * FROM tasks WHERE id = ?`,
			args: [id],
		});
		if (result.rows.length === 0) return null;
		return rowToTask(result.rows[0]!);
	}

	async listTasks(filter?: {
		status?: TaskStatus;
		limit?: number;
	}): Promise<Task[]> {
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
		const result = await this.client.execute({ sql, args });
		return result.rows.map(rowToTask);
	}

	async getDueTasks(): Promise<Task[]> {
		const result = await this.client.execute({
			sql: `SELECT * FROM tasks WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY priority DESC`,
			args: [new Date().toISOString()],
		});
		return result.rows.map(rowToTask);
	}

	async updateTask(
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
	): Promise<Task | null> {
		const sets: string[] = [];
		const args: (string | number | null)[] = [];
		for (const [key, value] of Object.entries(updates)) {
			if (value !== undefined) {
				sets.push(`${key} = ?`);
				args.push(
					value instanceof Date
						? value.toISOString()
						: (value as string | number | null),
				);
			}
		}
		if (sets.length === 0) return this.getTask(id);
		sets.push("updated_at = ?");
		args.push(new Date().toISOString());
		args.push(id);
		await this.client.execute({
			sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
			args,
		});
		return this.getTask(id);
	}

	// ─── Instructions ──────────────────────────────────────────────────────

	async upsertInstruction(
		filename: string,
		description: string,
	): Promise<void> {
		const id = randomUUID();
		await this.client.execute({
			sql: `INSERT INTO instructions (id, filename, description, updated_at) VALUES (?, ?, ?, ?)
			      ON CONFLICT(filename) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`,
			args: [id, filename, description, new Date().toISOString()],
		});
	}

	async listInstructions(): Promise<InstructionRecord[]> {
		const result = await this.client.execute(
			`SELECT * FROM instructions ORDER BY filename`,
		);
		return result.rows.map((row) => ({
			id: row.id as string,
			filename: row.filename as string,
			description: row.description as string,
			updated_at: new Date(row.updated_at as string),
		}));
	}

	// ─── Tool Usage ────────────────────────────────────────────────────────

	async saveToolUsage(params: {
		message_id?: string | null;
		namespace: string;
		name: string;
		input: Record<string, unknown>;
		result: ToolResult;
		output?: unknown;
		error?: string | null;
		duration_ms: number;
	}): Promise<ToolUsage> {
		const id = randomUUID();
		const now = new Date();
		await this.client.execute({
			sql: `INSERT INTO tool_usage (id, message_id, namespace, name, input, result, output, error, duration_ms, created_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				params.message_id ?? null,
				params.namespace,
				params.name,
				JSON.stringify(params.input),
				params.result,
				params.output ? JSON.stringify(params.output) : null,
				params.error ?? null,
				params.duration_ms,
				now.toISOString(),
			],
		});
		return {
			id,
			message_id: params.message_id ?? null,
			namespace: params.namespace,
			name: params.name,
			input: params.input,
			result: params.result,
			output: params.output ?? null,
			error: params.error ?? null,
			duration_ms: params.duration_ms,
			created_at: now,
		};
	}

	async close(): Promise<void> {
		this.client.close();
	}
}

// ─── Row Mappers ─────────────────────────────────────────────────────────────

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

function rowToMemory(row: Record<string, unknown>): Memory {
	return {
		id: row.id as string,
		key: row.key as string,
		value: row.value as string,
		category: row.category as MemoryCategory,
		access_count: (row.access_count as number) ?? 0,
		created_at: new Date(
			(row.created_at as string) ?? (row.updated_at as string),
		),
		updated_at: new Date(row.updated_at as string),
	};
}

function rowToTask(row: Record<string, unknown>): Task {
	return {
		id: row.id as string,
		title: row.title as string,
		description: row.description as string,
		status: row.status as TaskStatus,
		priority: row.priority as number,
		scheduled_at: row.scheduled_at
			? new Date(row.scheduled_at as string)
			: null,
		recurrence: row.recurrence as string | null,
		last_run_at: row.last_run_at ? new Date(row.last_run_at as string) : null,
		result: row.result as string | null,
		created_at: new Date(row.created_at as string),
		updated_at: new Date(row.updated_at as string),
	};
}

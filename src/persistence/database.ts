import { randomUUID } from "node:crypto";
import { type Client, createClient } from "@libsql/client";
import { chatBus } from "../core/logger";
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
} from "../core/model";
import { buildEmbeddingText } from "./embeddings";
import { listInstructions, upsertInstruction } from "./queries/instructionQueries";
import {
	bm25SearchMemories,
	forgetMemory,
	listAllMemories,
	listMemoriesByCategory,
	listMemoriesForReindex,
	listMemoriesMissingEmbeddings,
	recallMemory,
	updateMemoryEmbedding,
	upsertMemory,
	vectorSearchMemories,
} from "./queries/memoryQueries";
import {
	clearMessages,
	getMessageRoleAndSource,
	hasMessageWithMetadata,
	insertMessage,
	listRecentMessages,
	updateMessageContent,
} from "./queries/messageQueries";
import {
	getTaskById,
	insertTask,
	listDueTasks,
	listTasks,
	updateTaskById,
} from "./queries/taskQueries";
import { insertToolUsage } from "./queries/toolUsageQueries";

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
} from "../core/model";

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
		await insertMessage(this.client, msg);

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
		await updateMessageContent(this.client, id, content);

		// Emit the final content on chatBus
		const messageMeta = await getMessageRoleAndSource(this.client, id);
		if (messageMeta) {
			const role = messageMeta.role;
			if (role === "user" || role === "assistant") {
				chatBus.push({
					id,
					role,
					content,
					source: messageMeta.source,
				});
			}
		}
	}

	async getRecentMessages(limit = 20): Promise<Message[]> {
		return listRecentMessages(this.client, limit);
	}

	async hasMessageWithMetadata(key: string, value: string | number): Promise<boolean> {
		return hasMessageWithMetadata(this.client, key, value);
	}

	async clearMessages(): Promise<void> {
		await clearMessages(this.client);
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
		await upsertMemory(this.client, { id, key, value, category, embedding, updatedAt: now });
	}

	async recall(key: string): Promise<string | null> {
		return recallMemory(this.client, key);
	}

	async forget(key: string): Promise<boolean> {
		return forgetMemory(this.client, key);
	}

	async getAllMemories(): Promise<Memory[]> {
		return listAllMemories(this.client);
	}

	async getMemoriesByCategory(category: MemoryCategory, limit?: number): Promise<Memory[]> {
		return listMemoriesByCategory(this.client, category, limit);
	}

	async vectorSearch(
		queryEmbedding: number[],
		limit = 10,
		category?: MemoryCategory,
	): Promise<ScoredMemory[]> {
		return vectorSearchMemories(this.client, queryEmbedding, limit, category);
	}

	async bm25Search(query: string, limit = 10, category?: MemoryCategory): Promise<ScoredMemory[]> {
		return bm25SearchMemories(this.client, query, limit, category);
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
		const rows = await listMemoriesMissingEmbeddings(this.client);
		return this.reindexRows(rows, embedFn, onProgress);
	}

	async reindexAllEmbeddings(
		embedFn: (text: string) => Promise<number[]>,
		onProgress?: (completed: number, total: number, key: string) => void,
	): Promise<number> {
		const rows = await listMemoriesForReindex(this.client);
		return this.reindexRows(rows, embedFn, onProgress);
	}

	private async reindexRows(
		rows: Array<{ id: string; key: string; value: string; category: string }>,
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
			await updateMemoryEmbedding(this.client, row.id, embedding);
			count++;
			onProgress?.(count, total, row.key);
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
		await insertTask(this.client, {
			id,
			title: params.title,
			description: params.description ?? "",
			priority: params.priority ?? 5,
			scheduled_at: params.scheduled_at ?? null,
			recurrence: params.recurrence ?? null,
			created_at: now,
			updated_at: now,
		});
		return (await this.getTask(id))!;
	}

	async getTask(id: string): Promise<Task | null> {
		return getTaskById(this.client, id);
	}

	async listTasks(filter?: { status?: TaskStatus; limit?: number }): Promise<Task[]> {
		return listTasks(this.client, filter);
	}

	async getDueTasks(): Promise<Task[]> {
		return listDueTasks(this.client, new Date().toISOString());
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
		if (Object.keys(updates).length === 0) {
			return this.getTask(id);
		}
		await updateTaskById(this.client, id, updates, new Date().toISOString());
		return this.getTask(id);
	}

	// ─── Instructions ──────────────────────────────────────────────────────

	async upsertInstruction(filename: string, description: string): Promise<void> {
		await upsertInstruction(this.client, {
			id: randomUUID(),
			filename,
			description,
			updated_at: new Date().toISOString(),
		});
	}

	async listInstructions(): Promise<InstructionRecord[]> {
		return listInstructions(this.client);
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
		await insertToolUsage(this.client, {
			id,
			message_id: params.message_id ?? null,
			namespace: params.namespace,
			name: params.name,
			input: params.input,
			result: params.result,
			output: params.output ?? null,
			error: params.error ?? null,
			duration_ms: params.duration_ms,
			created_at: now.toISOString(),
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

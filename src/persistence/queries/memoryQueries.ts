import type { Client } from "@libsql/client";
import type { Memory, MemoryCategory, ScoredMemory } from "../../core/model";
import { vectorToSql } from "../embeddings";

export interface MemoryEmbeddingRow {
	id: string;
	key: string;
	value: string;
	category: MemoryCategory;
}

export async function upsertMemory(
	client: Client,
	params: {
		id: string;
		key: string;
		value: string;
		category: MemoryCategory;
		embedding?: number[];
		updatedAt: string;
	},
): Promise<void> {
	if (params.embedding) {
		await client.execute({
			sql: `INSERT INTO memory (id, key, value, category, embedding, updated_at)
			      VALUES (?, ?, ?, ?, vector(?), ?)
			      ON CONFLICT(key) DO UPDATE SET
			        value = excluded.value,
			        category = excluded.category,
			        embedding = excluded.embedding,
			        updated_at = excluded.updated_at`,
			args: [
				params.id,
				params.key,
				params.value,
				params.category,
				vectorToSql(params.embedding),
				params.updatedAt,
			],
		});
		return;
	}

	await client.execute({
		sql: `INSERT INTO memory (id, key, value, category, updated_at)
		      VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET
		        value = excluded.value,
		        category = excluded.category,
		        updated_at = excluded.updated_at`,
		args: [params.id, params.key, params.value, params.category, params.updatedAt],
	});
}

export async function recallMemory(client: Client, key: string): Promise<string | null> {
	const result = await client.execute({
		sql: `UPDATE memory SET access_count = access_count + 1 WHERE key = ? RETURNING value`,
		args: [key],
	});

	if (result.rows.length === 0) {
		return null;
	}

	return result.rows[0]!.value as string;
}

export async function forgetMemory(client: Client, key: string): Promise<boolean> {
	const result = await client.execute({
		sql: `DELETE FROM memory WHERE key = ?`,
		args: [key],
	});

	return result.rowsAffected > 0;
}

export async function listAllMemories(client: Client): Promise<Memory[]> {
	const result = await client.execute(`SELECT * FROM memory ORDER BY updated_at DESC`);
	return result.rows.map(rowToMemory);
}

export async function listMemoriesByCategory(
	client: Client,
	category: MemoryCategory,
	limit?: number,
): Promise<Memory[]> {
	let sql = `SELECT * FROM memory WHERE category = ? ORDER BY updated_at DESC`;
	const args: (string | number)[] = [category];
	if (limit) {
		sql += ` LIMIT ?`;
		args.push(limit);
	}

	const result = await client.execute({ sql, args });
	return result.rows.map(rowToMemory);
}

export async function vectorSearchMemories(
	client: Client,
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

	const result = await client.execute({ sql, args });
	return result.rows.map((row) => ({
		...rowToMemory(row),
		score: 1 - ((row.distance as number) ?? 1),
	}));
}

export async function bm25SearchMemories(
	client: Client,
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

	const result = await client.execute({ sql, args });
	return result.rows.map((row) => ({
		...rowToMemory(row),
		score: Math.max(0, 1 + (row.rank as number) * 0.1),
	}));
}

export async function listMemoriesMissingEmbeddings(client: Client): Promise<MemoryEmbeddingRow[]> {
	const result = await client.execute(
		`SELECT id, key, value, category FROM memory WHERE embedding IS NULL`,
	);

	return result.rows.map(rowToEmbeddingRow);
}

export async function listMemoriesForReindex(client: Client): Promise<MemoryEmbeddingRow[]> {
	const result = await client.execute(`SELECT id, key, value, category FROM memory`);
	return result.rows.map(rowToEmbeddingRow);
}

export async function updateMemoryEmbedding(
	client: Client,
	id: string,
	embedding: number[],
): Promise<void> {
	await client.execute({
		sql: `UPDATE memory SET embedding = vector(?) WHERE id = ?`,
		args: [vectorToSql(embedding), id],
	});
}

function rowToMemory(row: Record<string, unknown>): Memory {
	return {
		id: row.id as string,
		key: row.key as string,
		value: row.value as string,
		category: row.category as MemoryCategory,
		access_count: (row.access_count as number) ?? 0,
		created_at: new Date((row.created_at as string) ?? (row.updated_at as string)),
		updated_at: new Date(row.updated_at as string),
	};
}

function rowToEmbeddingRow(row: Record<string, unknown>): MemoryEmbeddingRow {
	return {
		id: row.id as string,
		key: row.key as string,
		value: row.value as string,
		category: row.category as MemoryCategory,
	};
}

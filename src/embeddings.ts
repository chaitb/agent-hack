import { gateway } from "@ai-sdk/gateway";
import { embed } from "ai";
import { logger } from "./logger";

const MODEL = gateway.embedding("mistral/mistral-embed");

/**
 * Build the canonical text used for embedding a memory entry.
 * Incorporates category, key, and value so the vector captures all dimensions.
 * Format: "[category] key: value"
 */
export function buildEmbeddingText(
	key: string,
	value: string,
	category: string,
): string {
	const txt = `[${category}] ${key}: ${value}`;
	logger.push("info", "Embedding text: " + txt);
	return txt;
}

/**
 * Generate a 1536-dim embedding for text using OpenAI text-embedding-3-small.
 * OR
 * Generate a 1024-dim embedding for text using Mistral AI's Mistral Embedding model.
 */
export async function getEmbedding(text: string): Promise<number[]> {
	const { embedding } = await embed({ model: MODEL, value: text });
	return embedding;
}

/**
 * Serialize a number[] to the JSON string format Turso expects for vector().
 */
export function vectorToSql(vec: number[]): string {
	return JSON.stringify(vec);
}

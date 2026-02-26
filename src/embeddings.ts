import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { logger } from "./logger";

const MODEL = openai.embedding("text-embedding-3-small"); // 1536 dimensions

/**
 * Generate a 1536-dim embedding for text using OpenAI text-embedding-3-small.
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

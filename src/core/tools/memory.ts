import { z } from "zod";
import { buildEmbeddingText, getEmbedding } from "../../persistence/embeddings";
import type { DB } from "../../persistence/database";
import type { MemoryCategory } from "../model";
import { createToolHandler } from "./createToolHandler";

export function createMemoryTools(db: DB) {
  return {
    remember: createToolHandler({
      namespace: "memory",
      name: "remember",
      description:
        "Save a piece of information to long-term memory. Use this when you learn something worth remembering about the user, their preferences, facts, or context that should persist across conversations.",
      db,
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Semantic key, e.g. 'user.timezone', 'user.name', 'preference.communication'",
          ),
        value: z.string().describe("The value to store"),
        category: z
          .enum(["preference", "fact", "skill", "context"])
          .default("fact")
          .describe("Category of this memory"),
      }),
      execute: async ({ key, value, category }) => {
        // Generate embedding for semantic search
        const embedding = await getEmbedding(buildEmbeddingText(key, value, category));
        await db.remember(key, value, category as MemoryCategory, embedding);
        return {
          success: true,
          key,
          message: `Remembered: ${key} = ${value}`,
        };
      },
    }),

    recall: createToolHandler({
      namespace: "memory",
      name: "recall",
      description:
        "Retrieve information from memory. Use exact key for known keys, or set mode='search' to find memories by meaning/topic using hybrid semantic + keyword search.",
      db,
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Exact key for mode='exact', or a natural-language query for mode='search'",
          ),
        mode: z
          .enum(["exact", "search"])
          .default("exact")
          .describe(
            "'exact' for key lookup, 'search' for hybrid semantic + keyword search",
          ),
        category: z
          .enum(["preference", "fact", "skill", "context"])
          .optional()
          .describe("Optional category filter for search mode"),
        limit: z.number().default(5).optional(),
      }),
      execute: async ({ key, mode, category, limit }) => {
        if (mode === "exact") {
          const value = await db.recall(key);
          if (value === null) return { found: false, key };
          return { found: true, key, value };
        }

        // Hybrid search: vector + BM25
        const queryEmbedding = await getEmbedding(key);
        const results = await db.hybridSearch(
          key,
          queryEmbedding,
          limit ?? 5,
          category as MemoryCategory | undefined,
        );
        return {
          found: results.length > 0,
          count: results.length,
          memories: results.map((m) => ({
            key: m.key,
            value: m.value,
            category: m.category,
            score: Math.round(m.score * 100) / 100,
          })),
        };
      },
    }),

    recall_all: createToolHandler({
      namespace: "memory",
      name: "recall_all",
      description:
        "Retrieve all stored memories, optionally filtered by category.",
      db,
      inputSchema: z.object({
        category: z
          .enum(["preference", "fact", "skill", "context"])
          .optional()
          .describe("Filter by category"),
      }),
      execute: async ({ category }) => {
        const memories = category
          ? await db.getMemoriesByCategory(category as MemoryCategory)
          : await db.getAllMemories();
        return {
          count: memories.length,
          memories: memories.map((m) => ({
            key: m.key,
            value: m.value,
            category: m.category,
          })),
        };
      },
    }),

    forget: createToolHandler({
      namespace: "memory",
      name: "forget",
      description:
        "Remove a piece of information from memory. Use when information is outdated or incorrect.",
      db,
      inputSchema: z.object({
        key: z.string().describe("The key to forget"),
      }),
      execute: async ({ key }) => {
        const deleted = await db.forget(key);
        return { success: deleted, key };
      },
    }),
  };
}

import { tool, type Tool } from "ai";
import type { z } from "zod";
import { logger } from "../logger";
import type { DB } from "../memory";

type AnyZodObject = z.ZodObject<z.core.$ZodLooseShape>;

interface ToolHandlerConfig<S extends AnyZodObject> {
	namespace: string;
	name: string;
	description: string;
	inputSchema: S;
	db: DB;
	execute: (input: z.infer<S>) => Promise<unknown>;
}

/**
 * Unified tool factory. Wraps every tool with:
 * - try/catch
 * - logger.push for success + failure
 * - tool_usage table insert
 * - consistent { success, ... } / { success: false, error } return shape
 *
 * The tool is registered under `${namespace}_${name}` as its key.
 */
export function createToolHandler<S extends AnyZodObject>(
	config: ToolHandlerConfig<S>,
): Tool<z.infer<S>, unknown> {
	const fullName = `${config.namespace}.${config.name}`;

	return tool({
		description: config.description,
		inputSchema: config.inputSchema,
		execute: async (input: z.infer<S>) => {
			const start = performance.now();
			try {
				const result = await config.execute(input);
				const duration_ms = Math.round(performance.now() - start);

				logger.push("tool", `${fullName}: ok (${duration_ms}ms)`);

				// Fire-and-forget DB write — don't block the tool response
				config.db
					.saveToolUsage({
						message_id: config.db.currentMessageId,
						namespace: config.namespace,
						name: config.name,
						input: input as Record<string, unknown>,
						result: "success",
						output: result,
						duration_ms,
					})
					.catch(() => {});

				return result;
			} catch (err) {
				const duration_ms = Math.round(performance.now() - start);
				const errorMsg = (err as Error).message;

				logger.push("tool", `${fullName}: FAILED — ${errorMsg} (${duration_ms}ms)`);

				config.db
					.saveToolUsage({
						message_id: config.db.currentMessageId,
						namespace: config.namespace,
						name: config.name,
						input: input as Record<string, unknown>,
						result: "failure",
						error: errorMsg,
						duration_ms,
					})
					.catch(() => {});

				return { success: false, error: errorMsg };
			}
		},
	});
}

/**
 * Helper to build a tool key from namespace + name.
 * e.g. ("notion", "search") → "notion_search"
 */
export function toolKey(namespace: string, name: string): string {
	return `${namespace}_${name}`;
}

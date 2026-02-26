import { tool } from "ai";
import { z } from "zod";
import type { DB } from "../memory";
import { createToolHandler } from "./createToolHandler";

export function createUtilityTools(db: DB) {
	return {
		get_current_time: createToolHandler({
			namespace: "utility",
			name: "get_current_time",
			description: "Get the current date, time, and timezone. Use whenever you need to know what time it is.",
			db,
			inputSchema: z.object({}),
			execute: async () => {
				const now = new Date();
				return {
					iso: now.toISOString(),
					local: now.toLocaleString(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					unix: now.getTime(),
				};
			},
		}),

		done: tool({
			description: "Signal that you have finished your work for this interaction.",
			inputSchema: z.object({
				summary: z.string().describe("Brief summary of what was accomplished"),
			}),
			// No execute — stops the agent loop
		}),
	};
}

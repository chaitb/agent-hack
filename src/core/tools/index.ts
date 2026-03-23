import type { DB } from "../../persistence/database";
import { type CommChannels, createCommunicationTools } from "./communication";
import { createFileTools } from "./files";
import { createMemoryTools } from "./memory";
import { createNotionTools } from "./notion";
import { createTaskTools } from "./tasks";
import { createUtilityTools } from "./utility";

export function createAllTools(db: DB, channels: CommChannels = {}) {
	return {
		...createMemoryTools(db),
		...createTaskTools(db),
		...createFileTools(db),
		...createCommunicationTools(db, channels),
		...createNotionTools(db),
		...createUtilityTools(db),
	};
}

export type AgentTools = ReturnType<typeof createAllTools>;

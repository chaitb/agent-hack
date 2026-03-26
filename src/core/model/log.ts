export type LogCategory = "tool" | "heartbeat" | "system" | "communication" | "info";

export interface LogEntry {
	id: number;
	category: LogCategory;
	message: string;
	timestamp: Date;
}

export interface SerializedLogEntry {
	id: number;
	category: LogCategory;
	message: string;
	timestamp: string;
}

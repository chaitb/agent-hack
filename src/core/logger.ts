import { EventEmitter } from "node:events";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export type LogCategory = "tool" | "heartbeat" | "system" | "communication" | "info";

export interface LogEntry {
	id: number;
	category: LogCategory;
	message: string;
	timestamp: Date;
}

const LOG_DIR = resolve(process.cwd(), "logs");
const LOG_FILE = resolve(LOG_DIR, "agent.log");

// Ensure log directory exists (fire-and-forget on import)
mkdir(LOG_DIR, { recursive: true }).catch(() => {});

function formatLine(category: string, message: string): string {
	return `${new Date().toISOString()} [${category.toUpperCase().padEnd(13)}] ${message}\n`;
}

function writeToFile(line: string): void {
	appendFile(LOG_FILE, line).catch(() => {});
}

class LogStore extends EventEmitter {
	private entries: LogEntry[] = [];
	private nextId = 0;

	push(category: LogCategory, message: string): void {
		const entry: LogEntry = {
			id: this.nextId++,
			category,
			message,
			timestamp: new Date(),
		};
		this.entries.push(entry);
		this.emit("log", entry);
		writeToFile(formatLine(category, message));
	}

	getAll(): LogEntry[] {
		return [...this.entries];
	}

	getByCategory(category: LogCategory): LogEntry[] {
		return this.entries.filter((e) => e.category === category);
	}
}

export const logger = new LogStore();

// ─── Chat Bus ────────────────────────────────────────────────────────────────
// External sources (Telegram, heartbeat tasks) emit messages here so
// the CLI's React UI can pick them up in real time.

export interface ChatEvent {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	source: string;
}

class ChatBus extends EventEmitter {
	push(event: ChatEvent): void {
		this.emit("message", event);
		writeToFile(
			formatLine("chat", `[${event.source}] ${event.role}: ${event.content.slice(0, 500)}`),
		);
	}
}

export const chatBus = new ChatBus();

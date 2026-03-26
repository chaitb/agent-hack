import { Agent } from "../core/agent";
import { ChatService } from "../core/chat";
import { Heartbeat } from "../core/heartbeat";
import { logger } from "../core/logger";
import { DB } from "../persistence/database";
import { TelegramAdapter } from "./telegram";

export interface CreateAppRuntimeOptions {
	startHeartbeat?: boolean;
	startTelegram?: boolean;
}

export interface AppRuntime {
	db: DB;
	agent: Agent;
	chatService: ChatService;
	heartbeat: Heartbeat | null;
	telegram: TelegramAdapter | null;
	dispose(): Promise<void>;
}

export async function createAppRuntime(options: CreateAppRuntimeOptions = {}): Promise<AppRuntime> {
	const { startHeartbeat = false, startTelegram = false } = options;
	const db = new DB();
	await db.initialize({ drop: false });
	logger.push("system", "Database connected");

	const agent = new Agent(db);
	logger.push("system", "Agent ready");

	let telegram: TelegramAdapter | null = null;
	if (startTelegram) {
		try {
			telegram = new TelegramAdapter(agent, db);
			telegram.start();
			agent.setChannels({
				telegram: (message) => telegram?.send(message) ?? Promise.resolve(),
			});
		} catch {
			logger.push("system", "Telegram: no token, skipping");
		}
	}

	let heartbeat: Heartbeat | null = null;
	if (startHeartbeat) {
		heartbeat = new Heartbeat(db, agent);
		heartbeat.start();
	}

	const chatService = new ChatService(db, agent);

	return {
		db,
		agent,
		chatService,
		heartbeat,
		telegram,
		async dispose() {
			telegram?.stop();
			heartbeat?.stop();
			await db.close();
		},
	};
}

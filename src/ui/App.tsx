import { Box, Text, useApp, useStdout } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { Agent } from "../agent";
import { DB } from "../database";
import { Heartbeat } from "../heartbeat";
import { logger } from "../logger";
import { TelegramAdapter } from "../telegram";
import { ChatPanel } from "./ChatPanel";
import { InputBar } from "./InputBar";
import { LogsPanel } from "./LogsPanel";
import { MemoryPanel } from "./MemoryPanel";
import { useStreamAgent } from "./useStreamAgent";

export function App() {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const rows = stdout?.rows ?? 24;
	const [ready, setReady] = useState(false);
	const [startTime] = useState(() => new Date());

	const [screen, setScreen] = useState("memory");
	const dbRef = useRef<DB | null>(null);
	const agentRef = useRef<Agent | null>(null);
	const heartbeatRef = useRef<Heartbeat | null>(null);
	const telegramRef = useRef<TelegramAdapter | null>(null);

	const { messages, isStreaming, send, addSystemMessage, clear, loadHistory } =
		useStreamAgent(agentRef.current ?? undefined);

	// Initialize on mount
	useEffect(() => {
		(async () => {
			try {
				const db = new DB();
				await db.initialize({ drop: false });
				logger.push("system", "Database connected");

				// Load previous session state
				await loadHistory(db);

				const agent = new Agent(db);
				logger.push("system", "Agent ready");

				// Start Telegram bot if token is set, wire send to agent
				try {
					const tg = new TelegramAdapter(agent, db);
					tg.start();
					telegramRef.current = tg;
					agent.setChannels({
						telegram: (msg) => tg.send(msg),
					});
				} catch {
					logger.push("system", "Telegram: no token, skipping");
				}

				const heartbeat = new Heartbeat(db, agent);
				heartbeat.start();

				dbRef.current = db;
				agentRef.current = agent;
				heartbeatRef.current = heartbeat;
				setReady(true);
			} catch (err) {
				logger.push("system", `Init error: ${(err as Error).message}`);
			}
		})();

		return () => {
			telegramRef.current?.stop();
			heartbeatRef.current?.stop();
			dbRef.current?.close();
		};
	}, [loadHistory]);

	const handleSubmit = async (input: string) => {
		// Handle commands
		if (input.startsWith("/")) {
			await handleCommand(input);
			return;
		}

		if (!ready) {
			addSystemMessage("Agent not ready yet...");
			return;
		}

		send(input);
	};

	const handleCommand = async (cmd: string) => {
		const [command] = cmd.split(" ");

		switch (command) {
			case "/exit":
			case "/quit":
			case "/q":
				heartbeatRef.current?.stop();
				await dbRef.current?.close();
				exit();
				return;

			case "/help":
				addSystemMessage("Commands: /tasks, /memory, /clear, /exit");
				return;

			case "/tasks": {
				setScreen("tasks");
				return;
			}

			case "/memory": {
				setScreen("memory");
				return;
			}

			case "/clear":
				clear();
				if (dbRef.current) await dbRef.current.clearMessages();
				addSystemMessage("History cleared.");
				return;

			default:
				addSystemMessage(`Unknown command: ${command}`);
				return;
		}
	};

	return (
		<Box flexDirection="column" height={rows}>
			<Box height={1}>
				<Text bold color="cyan">
					{" 🤖 CB's Agent "}
				</Text>
				<Text dimColor>{ready ? "— connected" : "— connecting..."}</Text>
			</Box>

			<Box flexDirection="row" flexGrow={1}>
				{/* Left: Chat */}
				<Box
					flexDirection="column"
					flexGrow={1}
					minWidth={"70%"}
					height={"100%"}
					borderStyle="single"
					borderColor="gray"
				>
					{screen === "chat" && (
						<>
							<ChatPanel messages={messages} isStreaming={isStreaming} />
							<InputBar
								onSubmit={handleSubmit}
								disabled={isStreaming || !ready}
							/>
						</>
					)}
					{screen === "memory" && (
						<MemoryPanel
							db={dbRef.current ?? undefined}
							onBack={() => setScreen("chat")}
						/>
					)}
				</Box>

				{/* Right: Logs */}
				<Box borderStyle="single" borderColor="gray" width={"30%"}>
					<LogsPanel db={dbRef.current ?? undefined} startTime={startTime} />
				</Box>
			</Box>
		</Box>
	);
}

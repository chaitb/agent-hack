import { Box, Text, useApp, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { logger } from "../../core/logger";
import type { AppRuntime } from "../../runtime/createAppRuntime";
import { createAppRuntime } from "../../runtime/createAppRuntime";
import { ChatPanel } from "./ChatPanel";
import { InputBar } from "./InputBar";
import { LogsPanel } from "./LogsPanel";
import { MemoryPanel } from "./MemoryPanel";
import { useStreamAgent } from "./useStreamAgent";

export function TuiApp() {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const rows = stdout?.rows ?? 24;
	const [ready, setReady] = useState(false);
	const [startTime] = useState(() => new Date());
	const [runtime, setRuntime] = useState<AppRuntime | null>(null);

	const [screen, setScreen] = useState("chat");
	const runtimeRef = useRef<AppRuntime | null>(null);

	const { messages, isStreaming, send, addSystemMessage, clear, loadHistory } = useStreamAgent(
		runtime?.chatService,
	);

	// Initialize on mount
	useEffect(() => {
		let disposed = false;

		(async () => {
			try {
				const nextRuntime = await createAppRuntime({
					startHeartbeat: true,
					startTelegram: true,
				});
				if (disposed) {
					await nextRuntime.dispose();
					return;
				}
				runtimeRef.current = nextRuntime;
				setRuntime(nextRuntime);
				await loadHistory(nextRuntime.chatService);
				setReady(true);
			} catch (err) {
				logger.push("system", `Init error: ${(err as Error).message}`);
			}
		})();

		return () => {
			disposed = true;
			void runtimeRef.current?.dispose();
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
				await runtimeRef.current?.dispose();
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
				if (runtimeRef.current) await runtimeRef.current.db.clearMessages();
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
							<InputBar onSubmit={handleSubmit} disabled={isStreaming || !ready} />
						</>
					)}
					{screen === "memory" && <MemoryPanel db={runtime?.db} onBack={() => setScreen("chat")} />}
				</Box>

				{/* Right: Logs */}
				<Box borderStyle="single" borderColor="gray" width={"30%"}>
					<LogsPanel db={runtime?.db} startTime={startTime} />
				</Box>
			</Box>
		</Box>
	);
}

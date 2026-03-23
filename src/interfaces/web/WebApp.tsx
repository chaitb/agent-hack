import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import type { ChatMessage } from "../../core/chat";
import type { Memory, ScoredMemory } from "../../core/model";
import { streamChat } from "./chatApi";
import {
	ButtonPill,
	Card,
	ChatSubmitMessage,
	ChromePanel,
	Eyebrow,
	ModeToggle,
	StatRow,
	StatusPill,
	uiFontClass,
} from "./components";
import { ChatRoute } from "./routes/ChatRoute";
import { LogsRoute } from "./routes/LogsRoute";
import { MemoryRoute } from "./routes/MemoryRoute";
import { NavTabs } from "./routes/NavTabs";
import { RecallRoute } from "./routes/RecallRoute";
import type { LogItem } from "./routes/types";
import { useTheme } from "./theme";

function appendChunk(messages: ChatMessage[], id: string, chunk: string): ChatMessage[] {
	return messages.map((message) =>
		message.id === id ? { ...message, content: message.content + chunk } : message,
	);
}

async function fetchInitialMessages(limit = 20): Promise<ChatMessage[]> {
	const response = await fetch(`/api/chat/messages?limit=${limit}`);
	if (!response.ok) {
		throw new Error("Failed to load recent chat history.");
	}

	const payload = (await response.json()) as { messages?: ChatMessage[] };
	return Array.isArray(payload.messages) ? payload.messages : [];
}

function parseMemory(value: unknown): Memory | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as {
		id?: unknown;
		key?: unknown;
		value?: unknown;
		category?: unknown;
		access_count?: unknown;
		created_at?: unknown;
		updated_at?: unknown;
	};

	if (
		typeof candidate.id !== "string" ||
		typeof candidate.key !== "string" ||
		typeof candidate.value !== "string" ||
		typeof candidate.category !== "string"
	) {
		return null;
	}

	if (
		candidate.category !== "fact" &&
		candidate.category !== "preference" &&
		candidate.category !== "skill" &&
		candidate.category !== "context"
	) {
		return null;
	}

	return {
		id: candidate.id,
		key: candidate.key,
		value: candidate.value,
		category: candidate.category,
		access_count: typeof candidate.access_count === "number" ? candidate.access_count : 0,
		created_at:
			typeof candidate.created_at === "string" ? new Date(candidate.created_at) : new Date(),
		updated_at:
			typeof candidate.updated_at === "string" ? new Date(candidate.updated_at) : new Date(),
	};
}

function parseScoredMemory(value: unknown): ScoredMemory | null {
	const memory = parseMemory(value);
	if (!memory) {
		return null;
	}

	const score = (value as { score?: unknown }).score;
	if (typeof score !== "number") {
		return null;
	}

	return {
		...memory,
		score,
	};
}

async function fetchMemories(category = "all"): Promise<Memory[]> {
	const params = new URLSearchParams({ limit: "200" });
	if (category !== "all") {
		params.set("category", category);
	}

	const response = await fetch(`/api/memory?${params.toString()}`);
	if (!response.ok) {
		throw new Error("Failed to load memories.");
	}

	const payload = (await response.json()) as { memories?: unknown[] };
	if (!Array.isArray(payload.memories)) {
		return [];
	}

	return payload.memories.map(parseMemory).filter((memory): memory is Memory => Boolean(memory));
}

async function testRecall(key: string): Promise<{ found: boolean; results: ScoredMemory[] }> {
	const response = await fetch("/api/memory/recall", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ key }),
	});

	if (!response.ok) {
		throw new Error("Recall request failed.");
	}

	const payload = (await response.json()) as {
		found?: boolean;
		value?: unknown;
	};

	const results = Array.isArray(payload.value)
		? payload.value.map(parseScoredMemory).filter((item): item is ScoredMemory => Boolean(item))
		: [];

	return {
		found: Boolean(payload.found),
		results,
	};
}

async function fetchLogs(category = "all"): Promise<LogItem[]> {
	const params = new URLSearchParams({ limit: "200" });
	if (category !== "all") {
		params.set("category", category);
	}

	const response = await fetch(`/api/logs?${params.toString()}`);
	if (!response.ok) {
		throw new Error("Failed to load logs.");
	}

	const payload = (await response.json()) as { logs?: LogItem[] };
	return Array.isArray(payload.logs) ? payload.logs : [];
}

function toRouteLabel(location: string): string {
	if (location === "/memory") {
		return "/memory";
	}
	if (location === "/recall") {
		return "/recall";
	}
	if (location === "/logs") {
		return "/logs";
	}

	return "/chat";
}

export function WebApp() {
	const { mode, resolvedTheme, setMode } = useTheme();
	const [location] = useLocation();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [showSidebar, setShowSidebar] = useState(false);
	const [draft, setDraft] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [isHistoryLoading, setIsHistoryLoading] = useState(true);
	const [memories, setMemories] = useState<Memory[]>([]);
	const [memoryCategory, setMemoryCategory] = useState("all");
	const [isMemoryLoading, setIsMemoryLoading] = useState(false);
	const [recallKey, setRecallKey] = useState("");
	const [recallResults, setRecallResults] = useState<ScoredMemory[]>([]);
	const [recallFound, setRecallFound] = useState<boolean | null>(null);
	const [isRecalling, setIsRecalling] = useState(false);
	const [logs, setLogs] = useState<LogItem[]>([]);
	const [logCategory, setLogCategory] = useState("all");
	const [isLogsLoading, setIsLogsLoading] = useState(false);
	const [status, setStatus] = useState("Loading recent messages");
	const [error, setError] = useState<string | null>(null);

	const messageCount = messages.length;
	const lastSource = messages.at(-1)?.source ?? "web";
	const routeLabel = toRouteLabel(location);
	const emptyState = useMemo(
		() =>
			"Ask a question, schedule work, or use this page as the browser view into the same long-lived agent session the TUI uses.",
		[],
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const initialMessages = await fetchInitialMessages(20);
				if (!cancelled) {
					setMessages((previous) => (previous.length > 0 ? previous : initialMessages));
					setStatus("Connected to shared runtime");
				}
			} catch (loadError) {
				const message =
					loadError instanceof Error ? loadError.message : "Failed to load recent chat history.";
				if (!cancelled) {
					setError(message);
					setStatus("Runtime error");
				}
			} finally {
				if (!cancelled) {
					setIsHistoryLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (location !== "/memory") {
			return;
		}

		let cancelled = false;
		setIsMemoryLoading(true);
		void (async () => {
			try {
				const nextMemories = await fetchMemories(memoryCategory);
				if (!cancelled) {
					setMemories(nextMemories);
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(loadError instanceof Error ? loadError.message : "Failed to load memories.");
				}
			} finally {
				if (!cancelled) {
					setIsMemoryLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [location, memoryCategory]);

	useEffect(() => {
		if (location !== "/logs") {
			return;
		}

		let cancelled = false;
		setIsLogsLoading(true);
		void (async () => {
			try {
				const nextLogs = await fetchLogs(logCategory);
				if (!cancelled) {
					setLogs(nextLogs);
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(loadError instanceof Error ? loadError.message : "Failed to load logs.");
				}
			} finally {
				if (!cancelled) {
					setIsLogsLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [location, logCategory]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextMessage = draft.trim();
		if (!nextMessage || isStreaming) {
			return;
		}

		const timestamp = Date.now();
		const assistantId = `assistant-${timestamp}`;
		const userMessage: ChatMessage = {
			id: `user-${timestamp}`,
			role: "user",
			content: nextMessage,
			source: "web",
		};
		const assistantMessage: ChatMessage = {
			id: assistantId,
			role: "assistant",
			content: "",
			source: "web",
		};

		setDraft("");
		setError(null);
		setStatus("Streaming response");
		setIsStreaming(true);
		setMessages((previous) => [...previous, userMessage, assistantMessage]);

		try {
			await streamChat({
				message: nextMessage,
				onStart: () => setStatus("Assistant is responding"),
				onToken: (chunk) => {
					setMessages((previous) => appendChunk(previous, assistantId, chunk));
				},
				onDone: () => setStatus("Connected to shared runtime"),
				onError: (message) => {
					throw new Error(message);
				},
			});
		} catch (streamError) {
			const message =
				streamError instanceof Error ? streamError.message : "The chat request failed.";
			setError(message);
			setStatus("Runtime error");
			setMessages((previous) => appendChunk(previous, assistantId, `\n\n[Error: ${message}]`));
		} finally {
			setIsStreaming(false);
		}
	};

	const handleRecallSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const key = recallKey.trim();
		if (!key || isRecalling) {
			return;
		}

		setIsRecalling(true);
		setError(null);
		try {
			const result = await testRecall(key);
			setRecallFound(result.found);
			setRecallResults(result.results);
		} catch (recallError) {
			setError(recallError instanceof Error ? recallError.message : "Recall failed.");
		} finally {
			setIsRecalling(false);
		}
	};

	return (
		<div className="flex min-h-screen gap-4 p-0 md:gap-6 md:p-6">
			<ChromePanel
				className="mx-auto flex h-screen max-h-screen w-full max-w-screen-md flex-col overflow-hidden md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)]"
				as="section"
			>
				<header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)] px-7 pb-4 pt-6">
					<div className="flex flex-grow flex-col gap-3">
						<h2 className={`text-2xl font-semibold text-primary ${uiFontClass}`}>{routeLabel}</h2>
						<NavTabs location={location} />
					</div>
					<StatusPill>{isStreaming ? "Streaming" : "Idle"}</StatusPill>
					<ButtonPill onClick={() => setShowSidebar(!showSidebar)}>
						{showSidebar ? "HIDE" : "INFO"}
					</ButtonPill>
				</header>

				<div className="min-h-0 flex flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-card)_80%,var(--bg))_0%,color-mix(in_srgb,var(--bg-muted)_75%,var(--bg))_100%)] px-7 py-6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent [&::-webkit-scrollbar]:w-1.5">
					<Switch>
						<Route path="/">
							<ChatRoute
								messages={messages}
								isHistoryLoading={isHistoryLoading}
								emptyState={emptyState}
								isStreaming={isStreaming}
							/>
						</Route>
						<Route path="/chat">
							<ChatRoute
								messages={messages}
								isHistoryLoading={isHistoryLoading}
								emptyState={emptyState}
								isStreaming={isStreaming}
							/>
						</Route>
						<Route path="/memory">
							<MemoryRoute
								memories={memories}
								memoryCategory={memoryCategory}
								isMemoryLoading={isMemoryLoading}
								onCategoryChange={setMemoryCategory}
							/>
						</Route>
						<Route path="/recall">
							<RecallRoute
								recallKey={recallKey}
								recallFound={recallFound}
								recallResults={recallResults}
								isRecalling={isRecalling}
								onRecallKeyChange={setRecallKey}
								onRecallSubmit={handleRecallSubmit}
							/>
						</Route>
						<Route path="/logs">
							<LogsRoute
								logs={logs}
								logCategory={logCategory}
								isLogsLoading={isLogsLoading}
								onCategoryChange={setLogCategory}
							/>
						</Route>
						<Route>
							<Card>
								<p className="text-muted-primary">Unknown route.</p>
							</Card>
						</Route>
					</Switch>
				</div>

				{(location === "/" || location === "/chat") && (
					<ChatSubmitMessage
						draft={draft}
						isStreaming={isStreaming}
						error={error}
						onChange={setDraft}
						onSubmit={handleSubmit}
					/>
				)}
			</ChromePanel>

			{showSidebar && (
				<ChromePanel className="h-full flex flex-col gap-6 p-7">
					<div className="space-y-4">
						<Eyebrow>Zen Chat Interface</Eyebrow>
						<h1
							className={`m-0 text-[clamp(2rem,3vw,3rem)] font-semibold tracking-[-0.04em] ${uiFontClass}`}
						>
							Mnemosyne Settings
						</h1>
						<p className="m-0 text-[0.98rem] leading-8 text-muted-primary">
							A browser surface over the same agent runtime, memory store, and task loop used by the
							TUI.
						</p>
					</div>

					<Card className="space-y-4">
						<div>
							<Eyebrow>Session status</Eyebrow>
							<p className={`text-sm text-primary ${uiFontClass}`}>{status}</p>
						</div>
						<div className="space-y-3 text-sm text-muted-primary">
							<StatRow label="Messages in view" value={messageCount} />
							<StatRow
								label="Latest source"
								value={<span className="uppercase">{lastSource}</span>}
							/>
							<StatRow label="Transport" value="SSE" />
						</div>
					</Card>

					<Card className="space-y-3">
						<Eyebrow>Appearance</Eyebrow>
						<ModeToggle mode={mode} onChange={setMode} />
						<p className="text-sm text-muted-primary">
							Using{" "}
							<span className={`font-semibold uppercase ${uiFontClass}`}>{resolvedTheme}</span>{" "}
							theme {mode === "system" ? "(following system)" : "(manually selected)"}.
						</p>
					</Card>
				</ChromePanel>
			)}
		</div>
	);
}

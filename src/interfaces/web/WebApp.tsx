import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "../../core/chat";
import { streamChat } from "./chatApi";
import {
	ButtonPill,
	Card,
	ChatSubmitMessage,
	ChromePanel,
	Eyebrow,
	MessageBubble,
	ModeToggle,
	StatRow,
	StatusPill,
	uiFontClass,
} from "./components";
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
	if (!Array.isArray(payload.messages)) {
		return [];
	}

	return payload.messages;
}

export function WebApp() {
	const { mode, resolvedTheme, setMode } = useTheme();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [showSidebar, setShowSidebar] = useState(false);
	const [draft, setDraft] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [isHistoryLoading, setIsHistoryLoading] = useState(true);
	const [status, setStatus] = useState("Loading recent messages");
	const [error, setError] = useState<string | null>(null);

	const messageCount = messages.length;
	const lastSource = messages.at(-1)?.source ?? "web";
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

	return (
		<div className="flex min-h-screen gap-4 p-0 md:gap-6 md:p-6">
			<ChromePanel
				className="mx-auto flex h-screen max-h-screen w-full max-w-screen-md flex-col overflow-hidden md:h-[calc(100vh-3rem)] md:max-h-[calc(100vh-3rem)]"
				as="section"
			>
				<header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)] px-7 pb-4 pt-6">
					<div className="flex-grow">
						<h2 className={"text-2xl font-semibold text-primary " + uiFontClass}>/chat</h2>
					</div>
					<StatusPill>{isStreaming ? "Streaming" : "Idle"}</StatusPill>
					<ButtonPill onClick={() => setShowSidebar(!showSidebar)}>
						{showSidebar ? "HIDE" : "INFO"}
					</ButtonPill>
				</header>

				<div className="min-h-0 flex flex-1 flex-col gap-4 overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-card)_80%,var(--bg))_0%,color-mix(in_srgb,var(--bg-muted)_75%,var(--bg))_100%)] px-7 py-6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent [&::-webkit-scrollbar]:w-1.5">
					{messages.length === 0 ? (
						<Card>
							<p className="m-0 text-[0.98rem] leading-8 text-muted-primary">
								{isHistoryLoading ? "Loading messages..." : emptyState}
							</p>
						</Card>
					) : (
						messages.map((message) => (
							<MessageBubble
								key={message.id}
								role={message.role}
								source={message.source}
								content={message.content}
								isStreaming={isStreaming}
							/>
						))
					)}
				</div>

				<ChatSubmitMessage
					draft={draft}
					isStreaming={isStreaming}
					error={error}
					onChange={setDraft}
					onSubmit={handleSubmit}
				/>
			</ChromePanel>

			{showSidebar && (
				<ChromePanel className="flex flex-col gap-6 p-7 h-full">
					<div className="space-y-4">
						<Eyebrow>Zen Chat Interface</Eyebrow>
						<h1
							className={
								"m-0 text-[clamp(2rem,3vw,3rem)] font-semibold tracking-[-0.04em] " + uiFontClass
							}
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
							<p className={"text-sm text-primary " + uiFontClass}>{status}</p>
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
							<span className={"font-semibold uppercase " + uiFontClass}>{resolvedTheme}</span>{" "}
							theme {mode === "system" ? "(following system)" : "(manually selected)"}.
						</p>
					</Card>
				</ChromePanel>
			)}
		</div>
	);
}

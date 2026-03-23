import { useMemo, useState, type FormEvent } from "react";
import type { ChatMessage } from "../../core/chat";
import { streamChat } from "./chatApi";

function readInitialMessages(): ChatMessage[] {
	const node = document.getElementById("initial-chat-state");
	if (!node?.textContent) {
		return [];
	}

	try {
		return JSON.parse(node.textContent) as ChatMessage[];
	} catch {
		return [];
	}
}

function appendChunk(messages: ChatMessage[], id: string, chunk: string): ChatMessage[] {
	return messages.map((message) =>
		message.id === id
			? { ...message, content: message.content + chunk }
			: message,
	);
}

export function WebApp() {
	const [messages, setMessages] = useState<ChatMessage[]>(() => readInitialMessages());
	const [draft, setDraft] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [status, setStatus] = useState("Connected to shared runtime");
	const [error, setError] = useState<string | null>(null);

	const messageCount = messages.length;
	const lastSource = messages.at(-1)?.source ?? "web";
	const emptyState = useMemo(
		() =>
			"Ask a question, schedule work, or use this page as the browser view into the same long-lived agent session the TUI uses.",
		[],
	);

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
				streamError instanceof Error
					? streamError.message
					: "The chat request failed.";
			setError(message);
			setStatus("Runtime error");
			setMessages((previous) =>
				appendChunk(previous, assistantId, `\n\n[Error: ${message}]`),
			);
		} finally {
			setIsStreaming(false);
		}
	};

	return (
		<div className="shell-grid">
			<section className="chrome-panel shell-sidebar">
				<div className="space-y-4">
					<p className="eyebrow">Zen Chat Interface</p>
					<h1 className="shell-title">Mnemosyne / Pocket Bot</h1>
					<p className="shell-copy">
						A browser surface over the same agent runtime, memory store, and
						task loop used by the TUI.
					</p>
				</div>

				<div className="zen-card space-y-4">
					<div>
						<p className="eyebrow">Session status</p>
						<p className="ui-font text-sm text-[var(--text-dark)]">{status}</p>
					</div>
					<div className="space-y-3 text-sm text-[var(--text-muted)]">
						<div className="stat-row">
							<span>Messages in view</span>
							<strong>{messageCount}</strong>
						</div>
						<div className="stat-row">
							<span>Latest source</span>
							<strong className="uppercase">{lastSource}</strong>
						</div>
						<div className="stat-row">
							<span>Transport</span>
							<strong>SSE</strong>
						</div>
					</div>
				</div>

				<div className="zen-card space-y-3">
					<p className="eyebrow">Design tokens</p>
					<p className="text-sm text-[var(--text-muted)]">
						Warm canvas, serif body copy, sans-serif UI chrome, soft borders,
						and asymmetric bubbles now live in the Tailwind layer instead of a
						one-off HTML file.
					</p>
					<div className="flex flex-wrap gap-2">
						<span className="status-pill">Lora body</span>
						<span className="status-pill">Raleway UI</span>
						<span className="status-pill">Soft cards</span>
						<span className="status-pill">Lavender action</span>
					</div>
				</div>
			</section>

			<section className="chrome-panel chat-surface">
				<header className="chat-header">
					<div>
						<p className="eyebrow">Route</p>
						<h2 className="ui-font text-2xl font-semibold text-[var(--text-dark)]">
							/chat
						</h2>
					</div>
					<div className="status-pill">
						{isStreaming ? "Streaming" : "Idle"}
					</div>
				</header>

				<div className="message-list custom-scrollbar">
					{messages.length === 0 ? (
						<div className="zen-card">
							<p className="shell-copy">{emptyState}</p>
						</div>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className={
									message.role === "user"
										? "message-row user-row"
										: "message-row"
								}
							>
								<div
									className={
										message.role === "user"
											? "chat-bubble chat-bubble-user"
											: "chat-bubble chat-bubble-agent"
									}
								>
									<p className="bubble-label">
										{message.role === "user" ? "You" : "Mnemosyne"} /{" "}
										{message.source}
									</p>
									<p className="whitespace-pre-wrap leading-7">
										{message.content || (isStreaming ? "..." : "")}
									</p>
								</div>
							</div>
						))
					)}
				</div>

				<form className="composer-shell" onSubmit={handleSubmit}>
					<label className="sr-only" htmlFor="chat-input">
						Ask Mnemosyne
					</label>
					<textarea
						id="chat-input"
						className="composer-input"
						rows={3}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder="Ask Mnemosyne..."
						disabled={isStreaming}
					/>
					<div className="composer-footer">
						<p className="composer-hint">
							{error ? error : "POST /api/chat streams tokens into this pane."}
						</p>
						<button className="composer-button" disabled={isStreaming} type="submit">
							{isStreaming ? "Thinking" : "Send"}
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}

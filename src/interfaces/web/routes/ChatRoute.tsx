import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import type { ChatMessage } from "../../../core/model";
import { Card, ChatSubmitMessage, MessageBubble } from "../components";
import { appendChunk, fetchMessages, queryKeys, streamChat } from "./api";

export function ChatRoute() {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const emptyState = useMemo(
		() =>
			"Ask a question, schedule work, or use this page as the browser view into the same long-lived agent session the TUI uses.",
		[],
	);

	const messagesQuery = useQuery({
		queryKey: queryKeys.messages(),
		queryFn: () => fetchMessages(20),
	});

	const messages = messagesQuery.data ?? [];

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
		setIsStreaming(true);
		queryClient.setQueryData<ChatMessage[]>(queryKeys.messages(), (current = []) => [
			...current,
			userMessage,
			assistantMessage,
		]);

		try {
			await streamChat({
				message: nextMessage,
				onStart: () => {},
				onToken: (chunk) => {
					queryClient.setQueryData<ChatMessage[]>(queryKeys.messages(), (current = []) =>
						appendChunk(current, assistantId, chunk),
					);
				},
				onDone: () => {},
				onError: (message) => {
					throw new Error(message);
				},
			});
		} catch (streamError) {
			const message =
				streamError instanceof Error ? streamError.message : "The chat request failed.";
			setError(message);
			queryClient.setQueryData<ChatMessage[]>(queryKeys.messages(), (current = []) =>
				appendChunk(current, assistantId, `\n\n[Error: ${message}]`),
			);
		} finally {
			setIsStreaming(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-1 flex-col gap-4 overflow-y-auto">
				{messages.length === 0 ? (
					<Card>
						<p className="m-0 text-[0.98rem] leading-8 text-muted-primary">
							{messagesQuery.isPending ? "Loading messages..." : emptyState}
						</p>
					</Card>
				) : (
					messages.map((message, index) => (
						<MessageBubble
							key={message.id}
							role={message.role}
							source={message.source}
							content={message.content}
							isStreaming={
								isStreaming && index === messages.length - 1 && message.role === "assistant"
							}
						/>
					))
				)}
			</div>
			<ChatSubmitMessage
				draft={draft}
				isStreaming={isStreaming}
				error={error ?? (messagesQuery.error instanceof Error ? messagesQuery.error.message : null)}
				onChange={setDraft}
				onSubmit={handleSubmit}
			/>
		</div>
	);
}

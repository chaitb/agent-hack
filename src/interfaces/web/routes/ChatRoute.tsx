import type { ChatMessage } from "../../../core/chat";
import { Card, MessageBubble } from "../components";

export function ChatRoute({
	messages,
	isHistoryLoading,
	emptyState,
	isStreaming,
}: {
	messages: ChatMessage[];
	isHistoryLoading: boolean;
	emptyState: string;
	isStreaming: boolean;
}) {
	return (
		<div className="flex flex-col gap-4">
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
	);
}

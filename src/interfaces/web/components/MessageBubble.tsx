import ReactMarkdown from "react-markdown";
import { cx, uiFontClass } from "./utils";

export function MessageBubble({
	role,
	source,
	content,
	isStreaming,
}: {
	role: "user" | "assistant" | "system" | "tool";
	source: string;
	content: string;
	isStreaming: boolean;
}) {
	const isUser = role === "user";
	const label =
		role === "user" ? "You" : role === "system" ? "System" : role === "tool" ? "Tool" : "Mnemosyne";

	return (
		<div className={cx("flex max-w-[85%]", isUser && "self-end justify-end max-md:max-w-full")}>
			<div
				className={cx(
					"rounded-[1.35rem] px-[1.1rem] py-4 text-primary",
					"border border-[color-mix(in_srgb,var(--muted-primary)_34%,transparent)]",
					isUser &&
						"rounded-br-[0.35rem] border-accent-pop/70 bg-[color-mix(in_srgb,var(--accent)_78%,var(--bg-card))] text-secondary",
					!isUser && "rounded-bl-[0.35rem]",
				)}
			>
				<p
					className={cx(
						"mb-2 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-muted-primary",
						uiFontClass,
					)}
				>
					{label} / {source}
				</p>
				<div className="tracking-normal">
					{content ? <ReactMarkdown>{content}</ReactMarkdown> : isStreaming ? "..." : ""}
				</div>
			</div>
		</div>
	);
}

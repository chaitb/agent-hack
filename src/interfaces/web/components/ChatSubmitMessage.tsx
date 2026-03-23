import type { FormEvent } from "react";
import { uiFontClass } from "./utils";

export function ChatSubmitMessage({
	draft,
	isStreaming,
	error,
	onChange,
	onSubmit,
}: {
	draft: string;
	isStreaming: boolean;
	error: string | null;
	onChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<form
			onSubmit={onSubmit}
			className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3.5 border-t border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)] bg-bg-card px-7 pb-7 pt-5"
		>
			<label className="sr-only" htmlFor="chat-input">
				Ask Mnemosyne
			</label>
			<textarea
				id="chat-input"
				rows={3}
				value={draft}
				onChange={(event) => onChange(event.target.value)}
				placeholder="Ask Mnemosyne..."
				disabled={isStreaming}
				className="min-h-[5.5rem] w-full resize-y rounded-2xl border border-muted-primary/35 bg-bg-muted px-4 py-4 text-primary shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--bg)_25%,transparent)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
			/>
			<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
				<p className={`m-0 text-[0.8rem] text-muted-primary ${uiFontClass}`}>
					{error ?? "POST /api/chat streams tokens into this pane."}
				</p>
				<button
					type="submit"
					disabled={isStreaming}
					className={
						"cursor-pointer rounded-[0.9rem] border-0 bg-accent px-5 py-3 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-secondary transition-all hover:-translate-y-px hover:bg-accent-pop disabled:cursor-default disabled:opacity-65 " +
						uiFontClass
					}
				>
					{isStreaming ? "Thinking" : "Send"}
				</button>
			</div>
		</form>
	);
}

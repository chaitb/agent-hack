import type { FormEvent } from "react";
import type { ScoredMemory } from "../../../core/model";
import { Card, uiFontClass } from "../components";

export function RecallRoute({
	recallKey,
	recallFound,
	recallResults,
	isRecalling,
	onRecallKeyChange,
	onRecallSubmit,
}: {
	recallKey: string;
	recallFound: boolean | null;
	recallResults: ScoredMemory[];
	isRecalling: boolean;
	onRecallKeyChange: (value: string) => void;
	onRecallSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<Card className="space-y-4">
				<form onSubmit={onRecallSubmit} className="space-y-3">
					<label
						className={`block text-xs uppercase text-muted-primary ${uiFontClass}`}
						htmlFor="recall-key"
					>
						Memory key
					</label>
					<input
						id="recall-key"
						value={recallKey}
						onChange={(event) => onRecallKeyChange(event.target.value)}
						placeholder="user.name"
						className="w-full rounded-xl border border-muted-primary/35 bg-bg-muted px-3 py-2 text-primary outline-none"
					/>
					<button
						type="submit"
						disabled={isRecalling}
						className={
							"rounded-lg bg-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-secondary hover:bg-accent-pop " +
							uiFontClass
						}
					>
						{isRecalling ? "Checking" : "Test Recall"}
					</button>
				</form>
			</Card>
			{recallFound !== null && (
				<Card className="space-y-2">
					<p className={`text-xs uppercase text-muted-primary ${uiFontClass}`}>Result</p>
					<p className="text-sm text-primary">
						{recallFound ? `Found ${recallResults.length} memory matches` : "Not found"}
					</p>
					{recallFound && recallResults.length > 0 && (
						<div className="space-y-2">
							{recallResults.map((memory) => (
								<div
									key={memory.id}
									className="rounded-lg border border-muted-primary/20 bg-bg-muted p-3"
								>
									<div className="flex items-center justify-between gap-3">
										<p className={`text-xs uppercase text-muted-primary ${uiFontClass}`}>
											{memory.key}
										</p>
										<p className="text-xs text-muted-primary">score {memory.score.toFixed(3)}</p>
									</div>
									<p className="mt-1 whitespace-pre-wrap text-sm text-primary">{memory.value}</p>
								</div>
							))}
						</div>
					)}
				</Card>
			)}
		</div>
	);
}

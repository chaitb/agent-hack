import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Card, uiFontClass } from "../components";
import { fetchRecall, queryKeys } from "./api";

export function RecallRoute() {
	const [key, setKey] = useState("");
	const [submittedKey, setSubmittedKey] = useState("");
	const recallQuery = useQuery({
		queryKey: queryKeys.recall(submittedKey),
		queryFn: () => fetchRecall(submittedKey),
		enabled: submittedKey.length > 0,
	});

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextKey = key.trim();
		if (!nextKey || recallQuery.isFetching) {
			return;
		}

		setSubmittedKey(nextKey);
	};

	return (
		<div className="flex flex-col gap-4">
			<Card className="space-y-4">
				<form onSubmit={handleSubmit} className="space-y-3">
					<label
						className={`block text-xs uppercase text-muted-primary ${uiFontClass}`}
						htmlFor="recall-key"
					>
						Memory key
					</label>
					<input
						id="recall-key"
						value={key}
						onChange={(event) => setKey(event.target.value)}
						placeholder="user.name"
						className="w-full rounded-xl border border-muted-primary/35 bg-bg-muted px-3 py-2 text-primary outline-none"
					/>
					<button
						type="submit"
						disabled={recallQuery.isFetching}
						className={
							"rounded-lg bg-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-secondary hover:bg-accent-pop " +
							uiFontClass
						}
					>
						{recallQuery.isFetching ? "Checking" : "Test Recall"}
					</button>
				</form>
				{recallQuery.isError && <p className="text-sm text-red-500">{recallQuery.error.message}</p>}
			</Card>
			{recallQuery.data && (
				<Card className="space-y-2">
					<p className={`text-xs uppercase text-muted-primary ${uiFontClass}`}>Result</p>
					<p className="text-sm text-primary">
						{recallQuery.data.found
							? `Found ${recallQuery.data.results.length} memory matches`
							: "Not found"}
					</p>
					{recallQuery.data.found && recallQuery.data.results.length > 0 && (
						<div className="space-y-2">
							{recallQuery.data.results.map((memory) => (
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

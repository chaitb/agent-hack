import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ButtonPill, Card, uiFontClass } from "../components";
import { fetchLogs, queryKeys } from "./api";

const LOG_CATEGORIES = ["all", "system", "tool", "heartbeat", "communication", "info"] as const;

export function LogsRoute() {
	const [category, setCategory] = useState<string>("all");
	const logsQuery = useQuery({
		queryKey: queryKeys.logs(category),
		queryFn: () => fetchLogs(category),
	});

	const logs = logsQuery.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{LOG_CATEGORIES.map((value) => (
					<ButtonPill
						key={value}
						onClick={() => setCategory(value)}
						className={category === value ? "bg-accent/40" : undefined}
					>
						{value.toUpperCase()}
					</ButtonPill>
				))}
			</div>
			{logsQuery.error instanceof Error ? (
				<Card>
					<p className="text-red-500">{logsQuery.error.message}</p>
				</Card>
			) : logsQuery.isPending ? (
				<Card>
					<p className="text-muted-primary">Loading logs...</p>
				</Card>
			) : logs.length === 0 ? (
				<Card>
					<p className="text-muted-primary">No logs captured yet.</p>
				</Card>
			) : (
				logs.map((entry) => (
					<Card key={entry.id} className="space-y-2">
						<div className="flex items-center justify-between">
							<p className={`text-xs uppercase text-muted-primary ${uiFontClass}`}>
								{entry.category}
							</p>
							<p className="text-xs text-muted-primary">
								{new Date(entry.timestamp).toLocaleString()}
							</p>
						</div>
						<p className="whitespace-pre-wrap text-sm text-primary">{entry.message}</p>
					</Card>
				))
			)}
		</div>
	);
}

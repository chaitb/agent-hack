import { ButtonPill, Card, uiFontClass } from "../components";
import type { LogItem } from "./types";

const LOG_CATEGORIES = ["all", "system", "tool", "heartbeat", "communication", "info"] as const;

export function LogsRoute({
	logs,
	logCategory,
	isLogsLoading,
	onCategoryChange,
}: {
	logs: LogItem[];
	logCategory: string;
	isLogsLoading: boolean;
	onCategoryChange: (category: string) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{LOG_CATEGORIES.map((category) => (
					<ButtonPill
						key={category}
						onClick={() => onCategoryChange(category)}
						className={logCategory === category ? "bg-accent/40" : undefined}
					>
						{category.toUpperCase()}
					</ButtonPill>
				))}
			</div>
			{isLogsLoading ? (
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

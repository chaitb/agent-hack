import { useState, useEffect } from "react";
import { logger, type LogEntry, type LogCategory } from "../../core/logger";

export function useLogger(category?: LogCategory): LogEntry[] {
	const [entries, setEntries] = useState<LogEntry[]>(
		category ? logger.getByCategory(category) : logger.getAll(),
	);

	useEffect(() => {
		const handler = (entry: LogEntry) => {
			if (!category || entry.category === category) {
				setEntries((prev) => [...prev, entry]);
			}
		};
		logger.on("log", handler);
		return () => {
			logger.off("log", handler);
		};
	}, [category]);

	return entries;
}

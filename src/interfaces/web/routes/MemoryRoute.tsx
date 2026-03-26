import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ButtonPill, Card, StatusPill, uiFontClass } from "../components";
import { fetchMemories, queryKeys } from "./api";

const MEMORY_CATEGORIES = ["all", "fact", "preference", "skill", "context"] as const;

export function MemoryRoute() {
	const [category, setCategory] = useState<string>("all");
	const memoriesQuery = useQuery({
		queryKey: queryKeys.memories(category),
		queryFn: () => fetchMemories(category),
	});

	const memories = memoriesQuery.data ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{MEMORY_CATEGORIES.map((value) => (
					<ButtonPill
						key={value}
						onClick={() => setCategory(value)}
						className={category === value ? "bg-accent/40" : undefined}
					>
						{value.toUpperCase()}
					</ButtonPill>
				))}
			</div>
			{memoriesQuery.error instanceof Error ? (
				<Card>
					<p className="text-red-500">{memoriesQuery.error.message}</p>
				</Card>
			) : memoriesQuery.isPending ? (
				<Card>
					<p className="text-muted-primary">Loading memories...</p>
				</Card>
			) : memories.length === 0 ? (
				<Card>
					<p className="text-muted-primary">No memories found.</p>
				</Card>
			) : (
				memories.map((memory) => (
					<Card key={memory.id} className="space-y-2">
						<div className="flex items-center justify-between">
							<p className={`text-sm text-primary ${uiFontClass}`}>{memory.key}</p>
							<StatusPill>{memory.category}</StatusPill>
						</div>
						<p className="whitespace-pre-wrap text-sm text-muted-primary">{memory.value}</p>
						<p className="text-xs text-muted-primary">Accessed {memory.access_count}x</p>
					</Card>
				))
			)}
		</div>
	);
}

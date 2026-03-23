import type { Memory } from "../../../core/model";
import { ButtonPill, Card, StatusPill, uiFontClass } from "../components";

const MEMORY_CATEGORIES = ["all", "fact", "preference", "skill", "context"] as const;

export function MemoryRoute({
	memories,
	memoryCategory,
	isMemoryLoading,
	onCategoryChange,
}: {
	memories: Memory[];
	memoryCategory: string;
	isMemoryLoading: boolean;
	onCategoryChange: (category: string) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-2">
				{MEMORY_CATEGORIES.map((category) => (
					<ButtonPill
						key={category}
						onClick={() => onCategoryChange(category)}
						className={memoryCategory === category ? "bg-accent/40" : undefined}
					>
						{category.toUpperCase()}
					</ButtonPill>
				))}
			</div>
			{isMemoryLoading ? (
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

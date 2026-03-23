export type MemoryCategory = "preference" | "fact" | "skill" | "context";

export interface Memory {
	id: string;
	key: string;
	value: string;
	category: MemoryCategory;
	access_count: number;
	created_at: Date;
	updated_at: Date;
}

/** Memory with a relevance score from search */
export interface ScoredMemory extends Memory {
	score: number;
}

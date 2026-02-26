export type ToolResult = "success" | "failure";

export interface ToolUsage {
	id: string;
	message_id: string | null;
	namespace: string;
	name: string;
	input: Record<string, unknown>;
	result: ToolResult;
	output: unknown;
	error: string | null;
	duration_ms: number;
	created_at: Date;
}

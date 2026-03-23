export type TaskStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface Task {
	id: string;
	title: string;
	description: string;
	status: TaskStatus;
	priority: number;
	scheduled_at: Date | null;
	recurrence: string | null;
	last_run_at: Date | null;
	result: string | null;
	created_at: Date;
	updated_at: Date;
}

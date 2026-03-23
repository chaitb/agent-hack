import type { DB } from "../persistence/database";
import type { Agent } from "./agent";
import { logger } from "./logger";
import type { Task } from "./model";

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

export class Heartbeat {
	private db: DB;
	private agent: Agent;
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(db: DB, agent: Agent) {
		this.db = db;
		this.agent = agent;
	}

	start(): void {
		if (this.timer) return;
		logger.push("heartbeat", "Started (60s interval)");
		this.timer = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
		// Run immediately on start too
		this.tick();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			logger.push("heartbeat", "Stopped");
		}
	}

	private async tick(): Promise<void> {
		if (this.running) return; // prevent overlap
		this.running = true;

		try {
			const dueTasks = await this.db.getDueTasks();
			if (dueTasks.length === 0) {
				this.running = false;
				return;
			}

			logger.push("heartbeat", `${dueTasks.length} task(s) due`);

			for (const task of dueTasks) {
				await this.executeTask(task);
			}
		} catch (err) {
			logger.push("heartbeat", `Error: ${(err as Error).message}`);
		} finally {
			this.running = false;
		}
	}

	private async executeTask(task: Task): Promise<void> {
		logger.push("heartbeat", `Running: ${task.title}`);

		// Mark as running
		await this.db.updateTask(task.id, { status: "running" });

		try {
			// All tasks go through the agent for now.
			// Simple deterministic tasks can be short-circuited here later.
			const result = await this.agent.run(
				`[TASK] Execute the following task:\nTitle: ${task.title}\nDescription: ${task.description}`,
				"task",
			);

			// Mark completed with result
			await this.db.updateTask(task.id, {
				status: "completed",
				result,
				last_run_at: new Date(),
			});

			// Handle recurrence — if the task has a pattern, reset it
			if (task.recurrence) {
				const nextRun = calculateNextRun(task.recurrence);
				if (nextRun) {
					await this.db.createTask({
						title: task.title,
						description: task.description,
						priority: task.priority,
						scheduled_at: nextRun.toISOString(),
						recurrence: task.recurrence,
					});
					logger.push("heartbeat", `Rescheduled: ${task.title} → ${nextRun.toISOString()}`);
				}
			}

			logger.push("heartbeat", `Completed: ${task.title}`);
		} catch (err) {
			await this.db.updateTask(task.id, {
				status: "failed",
				result: (err as Error).message,
			});
			logger.push("heartbeat", `Failed: ${task.title} — ${(err as Error).message}`);
		}
	}
}

/**
 * Simple cron-like parser. Supports a subset:
 * - "every <N>m" → every N minutes
 * - "every <N>h" → every N hours
 * - "daily <HH:MM>" → every day at HH:MM
 *
 * For full cron, swap this out for a library like `cron-parser`.
 */
function calculateNextRun(recurrence: string): Date | null {
	const now = new Date();

	const everyMinMatch = recurrence.match(/^every (\d+)m$/);
	if (everyMinMatch) {
		return new Date(now.getTime() + Number.parseInt(everyMinMatch[1]!, 10) * 60_000);
	}

	const everyHourMatch = recurrence.match(/^every (\d+)h$/);
	if (everyHourMatch) {
		return new Date(now.getTime() + Number.parseInt(everyHourMatch[1]!, 10) * 3_600_000);
	}

	const dailyMatch = recurrence.match(/^daily (\d{2}):(\d{2})$/);
	if (dailyMatch) {
		const next = new Date(now);
		next.setHours(Number.parseInt(dailyMatch[1]!, 10), Number.parseInt(dailyMatch[2]!, 10), 0, 0);
		if (next <= now) next.setDate(next.getDate() + 1);
		return next;
	}

	logger.push("system", `Unknown recurrence pattern: ${recurrence}`);
	return null;
}

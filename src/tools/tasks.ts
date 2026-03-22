import { z } from "zod";
import type { DB, TaskStatus } from "../database";
import { createToolHandler } from "./createToolHandler";

export function createTaskTools(db: DB) {
  return {
    schedule_task: createToolHandler({
      namespace: "tasks",
      name: "schedule",
      description:
        "Create a new task in the task queue. Tasks can be one-off or recurring. The heartbeat will pick up due tasks and execute them.",
      db,
      inputSchema: z.object({
        title: z.string().describe("Short human-readable task name"),
        description: z.string().optional().describe("What needs to be done"),
        priority: z.number().min(0).max(10).default(5),
        scheduled_at: z
          .string()
          .optional()
          .describe("ISO 8601 datetime. Omit for ASAP."),
        recurrence: z
          .string()
          .optional()
          .describe("e.g. 'every 30m', 'daily 09:00'"),
      }),
      execute: async ({
        title,
        description,
        priority,
        scheduled_at,
        recurrence,
      }) => {
        const task = await db.createTask({
          title,
          description,
          priority,
          scheduled_at: scheduled_at ?? null,
          recurrence: recurrence ?? null,
        });
        return {
          success: true,
          task_id: task.id,
          title: task.title,
          scheduled_at: task.scheduled_at?.toISOString() ?? "ASAP",
        };
      },
    }),

    list_tasks: createToolHandler({
      namespace: "tasks",
      name: "list",
      description: "List tasks, optionally filtered by status.",
      db,
      inputSchema: z.object({
        status: z
          .enum(["pending", "running", "completed", "failed", "cancelled"])
          .optional(),
        limit: z.number().optional().default(20),
      }),
      execute: async ({ status, limit }) => {
        const tasks = await db.listTasks({
          status: status as TaskStatus | undefined,
          limit,
        });
        return {
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            scheduled_at: t.scheduled_at?.toISOString() ?? null,
            recurrence: t.recurrence,
          })),
        };
      },
    }),

    update_task: createToolHandler({
      namespace: "tasks",
      name: "update",
      description:
        "Update a task's status, description, priority, or schedule.",
      db,
      inputSchema: z.object({
        task_id: z.string(),
        status: z
          .enum(["pending", "running", "completed", "failed", "cancelled"])
          .optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.number().min(0).max(10).optional(),
        scheduled_at: z.string().optional(),
      }),
      execute: async ({ task_id, ...updates }) => {
        const task = await db.updateTask(
          task_id,
          updates as Record<string, unknown>,
        );
        if (!task) return { success: false, error: "Task not found" };
        return { success: true, task_id: task.id, status: task.status };
      },
    }),

    cancel_task: createToolHandler({
      namespace: "tasks",
      name: "cancel",
      description: "Cancel a task.",
      db,
      inputSchema: z.object({
        task_id: z.string(),
      }),
      execute: async ({ task_id }) => {
        const task = await db.updateTask(task_id, { status: "cancelled" });
        if (!task) return { success: false, error: "Task not found" };
        return { success: true, task_id: task.id };
      },
    }),
  };
}

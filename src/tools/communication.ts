import { z } from "zod";
import type { DB } from "../database";
import { createToolHandler } from "./createToolHandler";

export interface CommChannels {
  telegram?: (message: string) => Promise<void>;
  email?: (subject: string, body: string) => Promise<void>;
}

export function createCommunicationTools(db: DB, channels: CommChannels) {
  return {
    send_telegram: createToolHandler({
      namespace: "comm",
      name: "send_telegram",
      description:
        "Send a Telegram message to the user. Use this to proactively reach out.",
      db,
      inputSchema: z.object({
        message: z.string().describe("The message to send"),
      }),
      execute: async ({ message }) => {
        await db.saveMessage("assistant", message, "telegram");
        if (!channels.telegram) throw new Error("Telegram not connected");
        await channels.telegram(message);
        return { success: true, channel: "telegram" };
      },
    }),

    send_email: createToolHandler({
      namespace: "comm",
      name: "send_email",
      description:
        "Send an email to the user. Use for longer-form communication.",
      db,
      inputSchema: z.object({
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body (plain text or markdown)"),
      }),
      execute: async ({ subject, body }) => {
        await db.saveMessage(
          "assistant",
          `[Email: ${subject}]\n${body}`,
          "email",
        );
        if (!channels.email) throw new Error("Email not connected");
        await channels.email(subject, body);
        return { success: true, channel: "email" };
      },
    }),

    notify: createToolHandler({
      namespace: "comm",
      name: "notify",
      description: "Send a notification to the user via the best channel.",
      db,
      inputSchema: z.object({
        message: z.string().describe("Notification message"),
        channel: z.enum(["telegram", "email"]).default("telegram"),
      }),
      execute: async ({ message, channel }) => {
        if (channel === "telegram") {
          await db.saveMessage("assistant", message, "telegram");
          if (!channels.telegram) throw new Error("Telegram not connected");
          await channels.telegram(message);
          return { success: true, channel: "telegram" };
        }
        await db.saveMessage("assistant", message, "email");
        if (!channels.email) throw new Error("Email not connected");
        await channels.email("Notification", message);
        return { success: true, channel: "email" };
      },
    }),
  };
}

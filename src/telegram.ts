import { Bot } from "grammy";
import type { Agent } from "./agent";
import { logger } from "./logger";
import type { DB } from "./database";

// ─── MarkdownV2 escaping ────────────────────────────────────────────────────

const SPECIAL_CHARS = /[_*[\]()~`>#\+\-=|{}.!\\]/g;

/**
 * Escape text for Telegram MarkdownV2, preserving:
 * - ```code blocks``` (language tags preserved)
 * - `inline code`
 * - **bold** → *bold*
 * - [links](url)
 */
function escapeMarkdownV2(text: string): string {
  const parts: string[] = [];
  let cursor = 0;

  // Match code blocks, inline code, bold, and links
  const pattern =
    /(```[\s\S]*?```)|(`[^`]+`)|(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Escape plain text before this match
    if (match.index > cursor) {
      parts.push(
        text.slice(cursor, match.index).replace(SPECIAL_CHARS, "\\$&"),
      );
    }

    if (match[1]) {
      // Code block: escape only ` and \ inside
      const block = match[1];
      const opening = block.match(/^```(\w*)\n?/)!;
      const lang = opening[1] ?? "";
      const inner = block.slice(opening[0].length, block.length - 3);
      const escaped = inner.replace(/[`\\]/g, "\\$&");
      parts.push(`\`\`\`${lang}\n${escaped}\`\`\``);
    } else if (match[2]) {
      // Inline code: escape only ` and \ inside
      const inner = match[2].slice(1, -1).replace(/[`\\]/g, "\\$&");
      parts.push(`\`${inner}\``);
    } else if (match[3]) {
      // Bold **text** → *escaped text*
      const inner = match[4]!.replace(SPECIAL_CHARS, "\\$&");
      parts.push(`*${inner}*`);
    } else if (match[5]) {
      // Link [text](url) — escape text normally, escape ) and \ in url
      const linkText = match[6]!.replace(SPECIAL_CHARS, "\\$&");
      const linkUrl = match[7]!.replace(/[)\\]/g, "\\$&");
      parts.push(`[${linkText}](${linkUrl})`);
    }

    cursor = match.index + match[0].length;
  }

  // Escape remaining plain text
  if (cursor < text.length) {
    parts.push(text.slice(cursor).replace(SPECIAL_CHARS, "\\$&"));
  }

  return parts.join("");
}

export class TelegramAdapter {
  private bot: Bot;
  private agent: Agent;
  private db: DB;
  private chatId: number | null = null;

  constructor(agent: Agent, db: DB) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
    this.chatId = process.env.TELEGRAM_CHAT_ID
      ? Number(process.env.TELEGRAM_CHAT_ID)
      : null;

    this.agent = agent;
    this.db = db;
    this.bot = new Bot(token);

    this.bot.command("start", (ctx) =>
      ctx.reply("Hey! I'm your personal assistant. Just talk to me."),
    );

    this.bot.on("message:text", async (ctx) => {
      const text = ctx.message.text;
      const user = ctx.from?.first_name ?? "user";
      const tgMessageId = ctx.message.message_id;

      // Remember the chat ID so we can send proactive messages
      if (!this.chatId) this.chatId = ctx.chat.id;

      // Dedup — skip if we've already processed this telegram message
      const exists = await this.db.hasMessageWithMetadata(
        "telegram_message_id",
        tgMessageId,
      );
      if (exists) {
        logger.push("system", `[TG] Skipping duplicate: ${tgMessageId}`);
        return;
      }

      logger.push("system", `[TG] ${user}: ${text}`);

      try {
        // agent.run() calls db.saveMessage() which emits on chatBus
        // Pass telegram metadata so we can dedup later
        const response = await this.agent.run(text, "telegram", {
          telegram_message_id: tgMessageId,
          telegram_chat_id: ctx.chat.id,
          telegram_user: user,
        });
        await ctx.reply(escapeMarkdownV2(response || "(no response)"), {
          parse_mode: "MarkdownV2",
        });
        logger.push("system", `[TG] Replied to ${user}`);
      } catch (err) {
        logger.push("system", `[TG] Error: ${(err as Error).message}`);
        await ctx.reply("Something went wrong. Try again.");
      }
    });
  }

  start(): void {
    // bot.start() uses long polling — non-blocking on the event loop
    this.bot.start({
      onStart: () => logger.push("system", "Telegram bot connected"),
    });
  }

  /**
   * Send a proactive message to the user's Telegram chat.
   * Used by communication tools.
   */
  async send(message: string): Promise<void> {
    if (!this.chatId) {
      throw new Error(
        "No Telegram chat ID — user hasn't messaged the bot yet. Set TELEGRAM_CHAT_ID in .env.",
      );
    }
    await this.bot.api.sendMessage(this.chatId, escapeMarkdownV2(message), {
      parse_mode: "MarkdownV2",
    });
  }

  stop(): void {
    this.bot.stop();
    logger.push("system", "Telegram bot stopped");
  }
}

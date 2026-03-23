import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gateway } from "@ai-sdk/gateway";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { generateText, hasToolCall, type ModelMessage, stepCountIs, streamText } from "ai";
import type { DB } from "../persistence/database";
import { logger } from "./logger";
import type { MessageSource } from "./model";
import { createAllTools } from "./tools";
import type { CommChannels } from "./tools/communication";

const INSTRUCTIONS_DIR = resolve(process.cwd(), "instructions");

export class Agent {
	private db: DB;
	private tools: ReturnType<typeof createAllTools>;
	private channels: CommChannels;
	private models: Record<"main", LanguageModelV3>;

	constructor(db: DB, channels: CommChannels = {}) {
		this.db = db;
		this.channels = channels;
		this.tools = createAllTools(db, channels);
		this.models = {
			main: gateway("anthropic/claude-haiku-4.5"),
			// main: fireworks("accounts/fireworks/models/kimi-k2-thinking"),
		};
	}

	/** Update channels after construction (e.g. once Telegram connects) */
	setChannels(channels: CommChannels): void {
		Object.assign(this.channels, channels);
		this.tools = createAllTools(this.db, this.channels);
	}

	/**
	 * Build the dynamic context for an interaction. This is the core of the
	 * "single session" model — we assemble the best possible context window
	 * from recent messages, memories, tasks, and instruction files.
	 */
	private async buildSystemPrompt(): Promise<string> {
		const TOKEN_BUDGET = 2000;
		const CHAR_BUDGET = TOKEN_BUDGET * 4; // ~chars/4 heuristic
		let charsUsed = 0;

		const parts: string[] = [];

		// 1. Load instruction files (identity — no budget cap, always included)
		const instructions = await this.loadInstructions();
		if (instructions) parts.push(instructions);

		// 2. TIER 1: Always inject preference memories (defines user identity)
		const preferences = await this.db.getMemoriesByCategory("preference");
		if (preferences.length > 0) {
			const lines: string[] = ["## User Preferences"];
			for (const m of preferences) {
				const line = `- ${m.key}: ${m.value}`;
				if (charsUsed + line.length + 1 > CHAR_BUDGET) break;
				lines.push(line);
				charsUsed += line.length + 1;
			}
			if (lines.length > 1) parts.push(lines.join("\n"));
		}

		// 3. TIER 2: Recent context memories (top 5 by recency)
		if (charsUsed < CHAR_BUDGET) {
			const recentContext = await this.db.getMemoriesByCategory("context", 5);
			if (recentContext.length > 0) {
				const lines: string[] = ["## Recent Context"];
				for (const m of recentContext) {
					const line = `- ${m.key}: ${m.value}`;
					if (charsUsed + line.length + 1 > CHAR_BUDGET) break;
					lines.push(line);
					charsUsed += line.length + 1;
				}
				if (lines.length > 1) parts.push(lines.join("\n"));
			}
		}

		// 4. Fact/skill memories are NOT injected — agent uses recall tool
		parts.push(
			"## Memory\n" +
				"You have stored facts, skills, and context memories accessible via the `recall` tool. " +
				'Use `recall` with `mode: "search"` and a natural language query to find relevant memories by topic.',
		);

		// 5. Inject active tasks
		const tasks = await this.db.listTasks({ status: "pending", limit: 10 });
		if (tasks.length > 0) {
			parts.push(
				"## Active Tasks\n" +
					tasks
						.map(
							(t) =>
								`- [P${t.priority}] ${t.title}${t.scheduled_at ? ` (scheduled: ${t.scheduled_at.toISOString()})` : ""}`,
						)
						.join("\n"),
			);
		}

		return parts.join("\n\n");
	}

	private async loadInstructions(): Promise<string | null> {
		const parts: string[] = [];
		try {
			async function walk(dir: string) {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						await walk(fullPath);
					} else if (entry.name.endsWith(".md")) {
						const content = await readFile(fullPath, "utf-8");
						parts.push(`### ${entry.name}\n${content}`);
					}
				}
			}
			await walk(INSTRUCTIONS_DIR);
		} catch {
			return null;
		}
		return parts.length > 0 ? `## Instructions\n${parts.join("\n\n")}` : null;
	}

	/**
	 * Run the agent on input from any source.
	 * Returns the final text response.
	 */
	async run(
		input: string,
		source: MessageSource = "cli",
		metadata?: Record<string, unknown>,
	): Promise<string> {
		// Save user message to timeline
		await this.db.saveMessage("user", input, source, metadata);

		// Create assistant placeholder BEFORE tools run so tool_usage links to it
		const assistantMsg = await this.db.saveMessage("assistant", "", source);
		this.db.currentMessageId = assistantMsg.id;

		// Build dynamic context
		const system = await this.buildSystemPrompt();

		// Load recent conversation history (exclude the empty placeholder)
		const recentMessages = await this.db.getRecentMessages(21);
		const messages: ModelMessage[] = recentMessages
			.filter((m) => m.id !== assistantMsg.id)
			.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

		// Run the agent loop
		const result = await generateText({
			model: this.models.main,
			system,
			messages,
			tools: this.tools,
			stopWhen: [stepCountIs(25), hasToolCall("done")],
			onStepFinish: ({ toolCalls }) => {
				for (const tc of toolCalls) {
					logger.push(
						"tool",
						`${tc.toolName}(${JSON.stringify("input" in tc ? tc.input : "").slice(0, 100)})`,
					);
				}
			},
		});

		const responseText = result.text || "";

		// Update the placeholder with actual content
		await this.db.updateMessageContent(assistantMsg.id, responseText);

		this.db.currentMessageId = null;
		return responseText;
	}

	/**
	 * Run the agent with streaming output.
	 */
	async *stream(input: string, source: MessageSource = "cli"): AsyncGenerator<string> {
		// Save user message to timeline
		await this.db.saveMessage("user", input, source);

		// Create assistant placeholder BEFORE tools run so tool_usage links to it
		const assistantMsg = await this.db.saveMessage("assistant", "", source);
		this.db.currentMessageId = assistantMsg.id;

		// Build dynamic context
		const system = await this.buildSystemPrompt();

		// Load recent conversation history (exclude the empty placeholder)
		const recentMessages = await this.db.getRecentMessages(21);
		const messages: ModelMessage[] = recentMessages
			.filter((m) => m.id !== assistantMsg.id)
			.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

		const result = streamText({
			model: this.models.main,
			system,
			messages,
			tools: this.tools,
			stopWhen: [stepCountIs(25), hasToolCall("done")],
			onStepFinish: ({ toolCalls }) => {
				for (const tc of toolCalls) {
					logger.push(
						"tool",
						`${tc.toolName}(${JSON.stringify("input" in tc ? tc.input : "").slice(0, 100)})`,
					);
				}
			},
		});

		let fullText = "";
		for await (const chunk of result.textStream) {
			fullText += chunk;
			yield chunk;
		}

		// Update the placeholder with actual content
		await this.db.updateMessageContent(assistantMsg.id, fullText);

		this.db.currentMessageId = null;
	}
}

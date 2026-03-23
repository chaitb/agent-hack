import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "../../core/chat";
import { createWebHandler } from "./server";

const history: ChatMessage[] = [
	{
		id: "assistant-1",
		role: "assistant",
		content: "Welcome back.",
		source: "web",
	},
];

function createStubHandler() {
	return createWebHandler({
		chatService: {
			async getRecentMessages() {
				return history;
			},
			async *streamReply(input: string) {
				yield `Echo: ${input}`;
			},
		},
		db: {
			async getAllMemories() {
				return [
					{
						id: "memory-1",
						key: "user.name",
						value: "Chaitanya",
						category: "fact",
						access_count: 0,
						created_at: new Date("2026-03-23T00:00:00.000Z"),
						updated_at: new Date("2026-03-23T00:00:00.000Z"),
					},
				];
			},
			async getMemoriesByCategory(category: "fact" | "preference" | "skill" | "context") {
				return category === "fact"
					? [
							{
								id: "memory-1",
								key: "user.name",
								value: "Chaitanya",
								category: "fact",
								access_count: 0,
								created_at: new Date("2026-03-23T00:00:00.000Z"),
								updated_at: new Date("2026-03-23T00:00:00.000Z"),
							},
						]
					: [];
			},
			async recall(key: string) {
				return key === "user.name" ? "Chaitanya" : null;
			},
			async vectorSearch(_queryEmbedding: number[], _limit?: number, _category?: string) {
				return [
					{
						id: "memory-1",
						key: "user.name",
						value: "Chaitanya",
						category: "fact",
						access_count: 1,
						created_at: new Date("2026-03-23T00:00:00.000Z"),
						updated_at: new Date("2026-03-23T00:00:00.000Z"),
						score: 0.71,
					},
				];
			},
		},
	});
}

describe("createWebHandler", () => {
	test("returns recent messages via GET /api/chat/messages", async () => {
		const handler = createStubHandler();
		const response = await handler(new Request("http://localhost/api/chat/messages?limit=20"));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ messages: history });
	});

	test("streams SSE events for POST /api/chat", async () => {
		const handler = createStubHandler();
		const response = await handler(
			new Request("http://localhost/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ message: "hello" }),
			}),
		);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/event-stream");
		expect(body).toContain("event: start");
		expect(body).toContain("event: token");
		expect(body).toContain("Echo: hello");
		expect(body).toContain("event: done");
	});

	test("rejects empty chat payloads", async () => {
		const handler = createStubHandler();
		const response = await handler(
			new Request("http://localhost/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ message: "   " }),
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toEqual({ error: "message is required." });
	});

	test("returns memory list via GET /api/memory", async () => {
		const handler = createStubHandler();
		const response = await handler(new Request("http://localhost/api/memory?limit=10"));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(Array.isArray(payload.memories)).toBe(true);
		expect(payload.memories[0]?.key).toBe("user.name");
	});

	test("tests recall via POST /api/memory/recall", async () => {
		const handler = createStubHandler();
		const response = await handler(
			new Request("http://localhost/api/memory/recall", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ key: "user.name" }),
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.found).toBe(true);
		expect(Array.isArray(payload.value)).toBe(true);
		expect(payload.value[0]?.key).toBe("user.name");
	});

	test("returns logs via GET /api/logs", async () => {
		const handler = createStubHandler();
		const response = await handler(new Request("http://localhost/api/logs?limit=5"));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(Array.isArray(payload.logs)).toBe(true);
	});
});

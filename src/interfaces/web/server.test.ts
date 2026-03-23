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
});

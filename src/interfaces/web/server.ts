import "dotenv/config";
import { resolve } from "node:path";
import { Hono } from "hono";
import type { ChatService } from "../../core/chat";
import { createAppRuntime } from "../../runtime/createAppRuntime";

const SSE_HEADERS = {
	"Cache-Control": "no-cache, no-transform",
	Connection: "keep-alive",
	"Content-Type": "text/event-stream",
};

export interface WebHandlerDependencies {
	chatService: Pick<ChatService, "getRecentMessages" | "streamReply">;
	assetDir?: string;
}

function resolveAssetDir(explicitDir?: string): string {
	if (explicitDir) {
		return explicitDir;
	}

	return resolve(process.cwd(), "dist/web");
}

function contentTypeForPath(pathname: string): string {
	if (pathname.endsWith(".css")) {
		return "text/css; charset=utf-8";
	}
	if (pathname.endsWith(".js")) {
		return "text/javascript; charset=utf-8";
	}
	return "application/octet-stream";
}

function parseMessageLimit(raw: string | undefined): number {
	if (!raw) {
		return 20;
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return 20;
	}

	return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function formatEvent(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function serveChatStream(
	chatService: Pick<ChatService, "streamReply">,
	message: string,
): Promise<Response> {
	const stream = new ReadableStream({
		start(controller) {
			const send = (event: string, data: unknown) => {
				controller.enqueue(formatEvent(event, data));
			};

			void (async () => {
				send("start", { ok: true });

				try {
					for await (const chunk of chatService.streamReply(message, "web")) {
						send("token", { chunk });
					}
					send("done", { ok: true });
				} catch (error) {
					const messageText = error instanceof Error ? error.message : "Unknown chat error";
					send("error", { message: messageText });
				} finally {
					controller.close();
				}
			})();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: SSE_HEADERS,
	});
}

async function serveAsset(assetDir: string, pathname: string): Promise<Response> {
	const filePath = resolve(assetDir, pathname.replace("/assets/", ""));
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return new Response("Asset not found.", { status: 404 });
	}

	return new Response(file, {
		headers: {
			"Content-Type": contentTypeForPath(pathname),
		},
	});
}

export function createWebHandler({ chatService, assetDir }: WebHandlerDependencies) {
	const resolvedAssetDir = resolveAssetDir(assetDir);
	const app = new Hono();

	app.get("/", (context) => {
		const webDevServerUrl = process.env.WEB_DEV_SERVER_URL;
		if (webDevServerUrl) {
			return context.redirect(webDevServerUrl, 302);
		}

		return context.text("Web UI is served separately. Use /api endpoints.", 404);
	});

	app.get("/assets/:fileName", async (context) => {
		if (process.env.WEB_DEV_SERVER_URL) {
			return context.text("Asset handled by Vite dev server.", 404);
		}

		const fileName = context.req.param("fileName");
		if (fileName !== "app.css" && fileName !== "client.js") {
			return context.text("Not found.", 404);
		}

		return serveAsset(resolvedAssetDir, `/assets/${fileName}`);
	});

	app.get("/api/chat/messages", async (context) => {
		const limit = parseMessageLimit(context.req.query("limit"));
		const messages = await chatService.getRecentMessages(limit);
		return context.json({ messages });
	});

	app.post("/api/chat", async (context) => {
		let payload: unknown;
		try {
			payload = await context.req.json();
		} catch {
			return context.json({ error: "Invalid JSON body." }, 400);
		}

		const message =
			payload &&
			typeof payload === "object" &&
			"message" in payload &&
			typeof payload.message === "string"
				? payload.message.trim()
				: "";

		if (!message) {
			return context.json({ error: "message is required." }, 400);
		}

		return serveChatStream(chatService, message);
	});

	app.all("*", (context) => context.text("Not found.", 404));

	return app.fetch;
}

export async function startWebServer() {
	const runtime = await createAppRuntime({
		startHeartbeat: false,
		startTelegram: true,
	});

	const port = Number(process.env.PORT ?? 3000);
	const server = Bun.serve({
		port,
		fetch: createWebHandler({
			chatService: runtime.chatService,
		}),
	});

	console.log(`Web API server listening on http://localhost:${server.port}`);
	return { runtime, server };
}

if (import.meta.main) {
	void startWebServer();
}

import "dotenv/config";
import { existsSync } from "fs";
import { resolve } from "path";
import type { ChatService } from "../../core/chat";
import { createAppRuntime } from "../../runtime/createAppRuntime";
import { renderChatPage } from "./page";

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

	const generatedDir = resolve(process.cwd(), ".generated/web");
	if (existsSync(generatedDir)) {
		return generatedDir;
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

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

function formatEvent(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
	);
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
					const messageText =
						error instanceof Error ? error.message : "Unknown chat error";
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

export function createWebHandler({
	chatService,
	assetDir,
}: WebHandlerDependencies) {
	const resolvedAssetDir = resolveAssetDir(assetDir);

	return async function handleWebRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/") {
			return Response.redirect(new URL("/chat", url), 302);
		}

		if (url.pathname === "/assets/app.css" || url.pathname === "/assets/client.js") {
			return serveAsset(resolvedAssetDir, url.pathname);
		}

		if (url.pathname === "/chat" && request.method === "GET") {
			const initialMessages = await chatService.getRecentMessages(20);
			return new Response(renderChatPage(initialMessages), {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
				},
			});
		}

		if (url.pathname === "/api/chat" && request.method === "POST") {
			let payload: unknown;
			try {
				payload = await request.json();
			} catch {
				return jsonResponse({ error: "Invalid JSON body." }, 400);
			}

			const message =
				payload &&
				typeof payload === "object" &&
				"message" in payload &&
				typeof payload.message === "string"
					? payload.message.trim()
					: "";

			if (!message) {
				return jsonResponse({ error: "message is required." }, 400);
			}

			return serveChatStream(chatService, message);
		}

		return new Response("Not found.", { status: 404 });
	};
}

export async function startWebServer() {
	const runtime = await createAppRuntime({
		startHeartbeat: false,
		startTelegram: false,
	});

	const port = Number(process.env.PORT ?? 3000);
	const server = Bun.serve({
		port,
		fetch: createWebHandler({
			chatService: runtime.chatService,
		}),
	});

	console.log(`Web server listening on http://localhost:${server.port}/chat`);
	return { runtime, server };
}

if (import.meta.main) {
	void startWebServer();
}

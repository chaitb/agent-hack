import "dotenv/config";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import type { ChatService } from "../../core/chat";
import { logger } from "../../core/logger";
import type { ArtifactContent, ArtifactExtension, LogCategory } from "../../core/model";
import type { DB } from "../../persistence/database";
import { getEmbedding } from "../../persistence/embeddings";
import { createAppRuntime } from "../../runtime/createAppRuntime";
import { type ChatPageAssets, renderChatPage } from "./page";

const SSE_HEADERS = {
	"Cache-Control": "no-cache, no-transform",
	Connection: "keep-alive",
	"Content-Type": "text/event-stream",
};

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR
	? resolve(process.cwd(), process.env.ARTIFACTS_DIR)
	: resolve(process.cwd(), "artifacts");

const ARTIFACT_CONTENT_TYPES: Record<ArtifactExtension, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".csv": "text/csv; charset=utf-8",
	".ts": "text/typescript; charset=utf-8",
	".tsx": "text/typescript; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".jsx": "text/javascript; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

export interface WebHandlerDependencies {
	chatService: Pick<ChatService, "getRecentMessages" | "streamReply">;
	db: Pick<DB, "getAllMemories" | "getMemoriesByCategory" | "recall" | "vectorSearch">;
	assetDir?: string;
}

function resolveAssetDir(explicitDir?: string): string {
	if (explicitDir) {
		return explicitDir;
	}

	return resolve(process.cwd(), "dist/web");
}

function stripTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolvePageAssets(viteDevServerUrl?: string): ChatPageAssets {
	if (viteDevServerUrl) {
		const origin = stripTrailingSlash(viteDevServerUrl);
		return {
			viteClientSrc: `${origin}/@vite/client`,
			clientScriptSrc: `${origin}/src/interfaces/web/client.tsx`,
		};
	}

	return {
		cssHref: "/assets/app.css",
		clientScriptSrc: "/assets/client.js",
	};
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

function getArtifactIdFromFilename(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	return lastDot >= 0 ? filename.slice(0, lastDot) : filename;
}

function getArtifactExtension(filename: string): ArtifactExtension | null {
	const lastDot = filename.lastIndexOf(".");
	const extension = (lastDot >= 0 ? filename.slice(lastDot) : ".txt") as ArtifactExtension;
	return extension in ARTIFACT_CONTENT_TYPES ? extension : null;
}

async function listArtifacts() {
	const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });

	return Promise.all(
		entries
			.filter((entry) => entry.isFile())
			.map(async (entry) => {
				const fullPath = join(ARTIFACTS_DIR, entry.name);
				const fileStat = await stat(fullPath);
				const id = getArtifactIdFromFilename(entry.name);

				return {
					id,
					filename: entry.name,
					url: `/api/artifacts/${id}/${entry.name}`,
					path: fullPath,
					created_at: fileStat.birthtime.toISOString(),
				};
			}),
	);
}

async function getArtifactById(id: string): Promise<ArtifactContent | null> {
	const artifacts = await listArtifacts();
	const artifact = artifacts.find((entry) => entry.id === id);
	if (!artifact) {
		return null;
	}

	const content = await readFile(artifact.path, "utf-8");
	const extension = getArtifactExtension(artifact.filename) ?? ".txt";

	return {
		id: artifact.id,
		filename: artifact.filename,
		extension,
		path: artifact.path,
		url: artifact.url,
		created_at: artifact.created_at,
		content,
	};
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

function parsePositiveLimit(raw: string | undefined, fallback: number, max: number): number {
	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function isMemoryCategory(value: string): value is "fact" | "preference" | "skill" | "context" {
	return value === "fact" || value === "preference" || value === "skill" || value === "context";
}

function isLogCategory(value: string): value is LogCategory {
	return (
		value === "tool" ||
		value === "heartbeat" ||
		value === "system" ||
		value === "communication" ||
		value === "info"
	);
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

export function createWebHandler({ chatService, db, assetDir }: WebHandlerDependencies) {
	const resolvedAssetDir = resolveAssetDir(assetDir);
	const webDevServerUrl = process.env.WEB_DEV_SERVER_URL;
	const pageAssets = resolvePageAssets(webDevServerUrl);
	const app = new Hono();

	app.use("*", honoLogger());

	const serveWebUi = () =>
		new Response(renderChatPage([], pageAssets), {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
			},
		});

	app.get("/", (context) => {
		if (webDevServerUrl) {
			return context.redirect(webDevServerUrl, 302);
		}

		return serveWebUi();
	});

	app.get("/chat", () => serveWebUi());
	app.get("/memory", () => serveWebUi());
	app.get("/recall", () => serveWebUi());
	app.get("/artifacts", () => serveWebUi());
	app.get("/artifacts/:id", () => serveWebUi());
	app.get("/logs", () => serveWebUi());

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

	app.get("/api/memory", async (context) => {
		const category = context.req.query("category");
		const limit = parsePositiveLimit(context.req.query("limit"), 100, 500);

		const memories =
			category && isMemoryCategory(category)
				? await db.getMemoriesByCategory(category, limit)
				: (await db.getAllMemories()).slice(0, limit);

		return context.json({ memories });
	});

	app.post("/api/memory/recall", async (context) => {
		let payload: unknown;
		try {
			payload = await context.req.json();
		} catch {
			return context.json({ error: "Invalid JSON body." }, 400);
		}

		const key =
			payload && typeof payload === "object" && "key" in payload && typeof payload.key === "string"
				? payload.key.trim()
				: "";

		if (!key) {
			return context.json({ error: "key is required." }, 400);
		}

		const queryEmbedding = await getEmbedding(key);
		const value = await db.vectorSearch(queryEmbedding);
		return context.json({ key, value, found: value !== null });
	});

	app.get("/api/logs", (context) => {
		const category = context.req.query("category");
		const limit = parsePositiveLimit(context.req.query("limit"), 200, 2000);

		const entries =
			category && isLogCategory(category) ? logger.getByCategory(category) : logger.getAll();

		return context.json({ logs: entries.slice(-limit) });
	});

	app.get("/api/artifacts/:id", async (context) => {
		try {
			const artifact = await getArtifactById(context.req.param("id"));
			if (!artifact) {
				return context.json({ error: "Artifact not found" }, 404);
			}

			return context.json(artifact);
		} catch (err) {
			return context.json({ error: (err as Error).message }, 500);
		}
	});

	app.get("/api/artifacts/:id/:filename", async (context) => {
		const id = context.req.param("id");
		const filename = context.req.param("filename");

		try {
			const artifact = await getArtifactById(id);
			if (!artifact || artifact.filename !== filename) {
				return context.json({ error: "Artifact not found" }, 404);
			}

			return new Response(artifact.content, {
				headers: {
					"Content-Type": ARTIFACT_CONTENT_TYPES[artifact.extension] ?? "text/plain; charset=utf-8",
				},
			});
		} catch (err) {
			return context.json({ error: (err as Error).message }, 500);
		}
	});

	app.get("/api/artifacts", async (context) => {
		try {
			return context.json({ artifacts: await listArtifacts() });
		} catch {
			return context.json({ artifacts: [] });
		}
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
			db: runtime.db,
		}),
	});

	console.log(`Web API server listening on http://localhost:${server.port}`);
	return { runtime, server };
}

if (import.meta.main) {
	void startWebServer();
}

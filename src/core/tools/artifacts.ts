import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { DB } from "../../persistence/database";
import {
	ALLOWED_EXTENSIONS,
	generateArtifactId,
	getExtension,
	isValidExtension,
} from "../model/artifact";
import { createToolHandler } from "./createToolHandler";

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR
	? resolve(process.cwd(), process.env.ARTIFACTS_DIR)
	: resolve(process.cwd(), "artifacts");

async function ensureArtifactsDir() {
	await mkdir(ARTIFACTS_DIR, { recursive: true });
}

function getArtifactUrl(id: string, filename: string): string {
	return `/api/artifacts/${id}/${filename}`;
}

function getArtifactIdFromFilename(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	return lastDot >= 0 ? filename.slice(0, lastDot) : filename;
}

async function findArtifactById(id: string): Promise<{ path: string; filename: string } | null> {
	try {
		const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.startsWith(id)) {
				return { path: join(ARTIFACTS_DIR, entry.name), filename: entry.name };
			}
		}
		return null;
	} catch {
		return null;
	}
}

export function createArtifactTools(db: DB) {
	return {
		write_artifact: createToolHandler({
			namespace: "artifacts",
			name: "write",
			description:
				"Write content to an artifact file. Returns artifact_id, path, and URL for viewing. Use for generating files like HTML, CSS, JSON, CSV, TypeScript, Markdown, or plain text.",
			db,
			inputSchema: z.object({
				filename: z.string().describe("Filename with extension (e.g. 'report.md', 'data.json')"),
				content: z.string().describe("File content to write"),
			}),
			execute: async ({ filename, content }) => {
				await ensureArtifactsDir();
				const ext = getExtension(filename);
				if (!isValidExtension(ext)) {
					return {
						success: false,
						error: `Invalid extension "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
					};
				}
				const id = generateArtifactId(filename);
				const fullFilename = `${id}${ext}`;
				const fullPath = join(ARTIFACTS_DIR, fullFilename);
				await writeFile(fullPath, content, "utf-8");
				const url = getArtifactUrl(id, fullFilename);
				return {
					success: true,
					artifact_id: id,
					path: fullPath,
					url,
					filename: fullFilename,
				};
			},
		}),

		read_artifact: createToolHandler({
			namespace: "artifacts",
			name: "read",
			description:
				"Read the contents of an artifact file. Use artifact_id from a previous write_artifact call.",
			db,
			inputSchema: z.object({
				artifact_id: z.string().describe("The artifact ID returned from write_artifact"),
			}),
			execute: async ({ artifact_id }) => {
				await ensureArtifactsDir();
				const found = await findArtifactById(artifact_id);
				if (!found) {
					return { success: false, error: `Artifact not found: ${artifact_id}` };
				}
				const content = await readFile(found.path, "utf-8");
				const fileStat = await stat(found.path);
				return {
					success: true,
					artifact_id,
					filename: found.filename,
					path: found.path,
					url: getArtifactUrl(artifact_id, found.filename),
					content,
					created_at: fileStat.birthtime.toISOString(),
				};
			},
		}),

		list_artifacts: createToolHandler({
			namespace: "artifacts",
			name: "list",
			description: "List all artifacts in the artifacts directory.",
			db,
			inputSchema: z.object({}),
			execute: async () => {
				await ensureArtifactsDir();
				const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });
				const artifacts = await Promise.all(
					entries
						.filter((e) => e.isFile())
						.map(async (e) => {
							const fullPath = join(ARTIFACTS_DIR, e.name);
							const fileStat = await stat(fullPath);
							const id = getArtifactIdFromFilename(e.name);
							return {
								id,
								filename: e.name,
								extension: getExtension(e.name),
								url: getArtifactUrl(id, e.name),
								created_at: fileStat.birthtime.toISOString(),
							};
						}),
				);
				return { success: true, artifacts };
			},
		}),
	};
}

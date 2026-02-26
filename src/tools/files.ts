import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve, relative } from "path";
import { z } from "zod";
import type { DB } from "../memory";
import { createToolHandler } from "./createToolHandler";

const INSTRUCTIONS_DIR = resolve(process.cwd(), "instructions");

export function createFileTools(db: DB) {
	return {
		read_file: createToolHandler({
			namespace: "files",
			name: "read",
			description: "Read the contents of a file from the project directory.",
			db,
			inputSchema: z.object({
				path: z.string().describe("Relative path from project root"),
			}),
			execute: async ({ path }) => {
				const fullPath = resolve(process.cwd(), path);
				const content = await readFile(fullPath, "utf-8");
				return { success: true, path, content };
			},
		}),

		write_file: createToolHandler({
			namespace: "files",
			name: "write",
			description: "Write content to a file. Creates the file if it doesn't exist.",
			db,
			inputSchema: z.object({
				path: z.string().describe("Relative path from project root"),
				content: z.string().describe("File content to write"),
			}),
			execute: async ({ path, content }) => {
				const fullPath = resolve(process.cwd(), path);
				const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
				await mkdir(dir, { recursive: true });
				await writeFile(fullPath, content, "utf-8");
				return { success: true, path };
			},
		}),

		list_files: createToolHandler({
			namespace: "files",
			name: "list",
			description: "List files in a directory.",
			db,
			inputSchema: z.object({
				path: z.string().default(".").describe("Relative directory path"),
			}),
			execute: async ({ path }) => {
				const fullPath = resolve(process.cwd(), path);
				const entries = await readdir(fullPath, { withFileTypes: true });
				return {
					success: true,
					path,
					entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" })),
				};
			},
		}),

		read_instructions: createToolHandler({
			namespace: "files",
			name: "read_instructions",
			description: "Read a specific instruction/skill file from the instructions directory.",
			db,
			inputSchema: z.object({
				filename: z.string().describe("e.g. 'system-prompt.md' or 'skills/email-summary.md'"),
			}),
			execute: async ({ filename }) => {
				const fullPath = join(INSTRUCTIONS_DIR, filename);
				const content = await readFile(fullPath, "utf-8");
				return { success: true, filename, content };
			},
		}),

		update_instructions: createToolHandler({
			namespace: "files",
			name: "update_instructions",
			description: "Write or update an instruction/skill file. This is how the agent evolves its own behavior.",
			db,
			inputSchema: z.object({
				filename: z.string().describe("e.g. 'communication-style.md'"),
				content: z.string().describe("New content for the file"),
				description: z.string().optional().describe("Brief description of this instruction file"),
			}),
			execute: async ({ filename, content, description }) => {
				const fullPath = join(INSTRUCTIONS_DIR, filename);
				const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
				await mkdir(dir, { recursive: true });
				await writeFile(fullPath, content, "utf-8");
				await db.upsertInstruction(filename, description ?? `Instruction file: ${filename}`);
				return { success: true, filename };
			},
		}),

		list_skills: createToolHandler({
			namespace: "files",
			name: "list_skills",
			description: "List all instruction and skill files available to the agent.",
			db,
			inputSchema: z.object({}),
			execute: async () => {
				const files: string[] = [];
				async function walk(dir: string) {
					const entries = await readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						const fullPath = join(dir, entry.name);
						if (entry.isDirectory()) await walk(fullPath);
						else files.push(relative(INSTRUCTIONS_DIR, fullPath));
					}
				}
				await walk(INSTRUCTIONS_DIR);
				const dbRecords = await db.listInstructions();
				return {
					success: true,
					files,
					indexed: dbRecords.map((r) => ({ filename: r.filename, description: r.description })),
				};
			},
		}),
	};
}

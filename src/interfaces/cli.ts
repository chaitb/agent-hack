#!/usr/bin/env bun

import cliProgress from "cli-progress";
import type { Argv } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { DB } from "../persistence/database";
import { getEmbedding } from "../persistence/embeddings";

type ProgressCallback = (completed: number, total: number, key: string) => void;

interface ProgressBar {
	start(total: number, startValue: number, payload?: Record<string, unknown>): void;
	update(value: number, payload?: Record<string, unknown>): void;
	stop(): void;
}

async function executeWithProgress(
	startMessage: string,
	runner: (progress: ProgressCallback) => Promise<number>,
): Promise<number> {
	console.log(startMessage);
	const barRef: { current: ProgressBar | null } = { current: null };

	const progress: ProgressCallback = (completed, total, key) => {
		if (!barRef.current && total > 0) {
			barRef.current = new cliProgress.SingleBar(
				{
					format: "Re-indexing |{bar}| {percentage}% | {value}/{total} | {key}",
					hideCursor: true,
				},
				cliProgress.Presets.shades_classic,
			) as unknown as ProgressBar;
			barRef.current.start(total, 0, { key: "" });
		}
		const displayKey = key.length > 22 ? `${key.slice(0, 19)}...` : key;
		barRef.current?.update(completed, { key: displayKey });
	};

	const count = await runner(progress);
	barRef.current?.update(count);
	barRef.current?.stop();
	return count;
}

async function withDb<T>(action: (db: DB) => Promise<T>, drop = false): Promise<T> {
	const db = new DB();
	try {
		console.log("Connecting to database...");
		await db.initialize({ drop });
		console.log("Connection ready.");
		return await action(db);
	} finally {
		db.close();
	}
}

void yargs(hideBin(process.argv))
	.scriptName("pocket")
	.command(
		"migrate",
		"Run migrations",
		(y: Argv) =>
			y.option("drop", {
				type: "boolean",
				default: false,
				describe: "Drop existing tables before migrating",
			}),
		async ({ drop }: { drop: boolean }) => {
			await withDb(async () => {
				console.log(drop ? "Tables dropped and migrations applied." : "Migrations complete.");
			}, drop);
		},
	)
	.command(
		"reindex",
		"Rebuild embeddings",
		(y: Argv) =>
			y.option("all", {
				alias: "a",
				type: "boolean",
				default: false,
				describe: "Rebuild embeddings for every stored memory",
			}),
		async ({ all }: { all: boolean }) => {
			await withDb(async (db) => {
				const text = all
					? "Re-indexing every memory (overwriting existing embeddings)..."
					: "Re-indexing memories that lack embeddings...";
				const count = await executeWithProgress(text, (progress) =>
					all
						? db.reindexAllEmbeddings(getEmbedding, progress)
						: db.backfillEmbeddings(getEmbedding, progress),
				);
				if (count === 0) {
					console.log("No memories needed re-indexing.");
				} else {
					console.log(`Re-indexed ${count} memories.`);
				}
			});
		},
	)
	.command(
		"clear",
		"Delete all rows from every table",
		(y: Argv) =>
			y.option("yes", {
				alias: "y",
				type: "boolean",
				default: false,
				describe: "Confirm deletion without prompting",
			}),
		async ({ yes }: { yes: boolean }) => {
			if (!yes) {
				console.log("This is destructive. Re-run with --yes to confirm.");
				return;
			}
			await withDb(async (db) => {
				await db.clearAllData();
				console.log("All table data cleared.");
			});
		},
	)
	.command(
		"drop",
		"Drop all tables and recreate the schema",
		(y: Argv) =>
			y.option("yes", {
				alias: "y",
				type: "boolean",
				default: false,
				describe: "Confirm drop/recreate",
			}),
		async ({ yes }: { yes: boolean }) => {
			if (!yes) {
				console.log("Drops are destructive. Re-run with --yes to proceed.");
				return;
			}
			await withDb(async () => {
				console.log("Tables dropped and recreated.");
			}, true);
		},
	)
	.demandCommand(1, "Select a sub-command")
	.strict()
	.help()
	.parseAsync()
	.catch((error: unknown) => {
		console.error("CLI failed:", error);
		process.exit(1);
	});

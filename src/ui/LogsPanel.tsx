import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { useLogger } from "./useLogger";
import type { DB } from "../memory";

interface LogsPanelProps {
	db: DB | undefined;
	startTime: Date;
}

export function LogsPanel({ db, startTime }: LogsPanelProps) {
	return (
		<Box flexDirection="column" paddingX={1} width={34}>
			<SystemInfo db={db} startTime={startTime} />
			<Box marginTop={1}>
				<ToolCallsSection />
			</Box>
			<Box marginTop={1}>
				<HeartbeatSection />
			</Box>
		</Box>
	);
}

function SystemInfo({
	db,
	startTime,
}: { db: DB | undefined; startTime: Date }) {
	const [memoryCount, setMemoryCount] = useState(0);
	const [taskCount, setTaskCount] = useState(0);
	const [uptime, setUptime] = useState("0s");

	useEffect(() => {
		const update = async () => {
			if (!db) return;
			try {
				const memories = await db.getAllMemories();
				const tasks = await db.listTasks({ status: "pending" });
				setMemoryCount(memories.length);
				setTaskCount(tasks.length);
			} catch {
				// db not ready yet
			}
			const elapsed = Math.floor(
				(Date.now() - startTime.getTime()) / 1000,
			);
			const m = Math.floor(elapsed / 60);
			const s = elapsed % 60;
			setUptime(m > 0 ? `${m}m ${s}s` : `${s}s`);
		};

		update();
		const interval = setInterval(update, 10_000);
		return () => clearInterval(interval);
	}, [db, startTime]);

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				System
			</Text>
			<Text dimColor> model: sonnet-4</Text>
			<Text dimColor> uptime: {uptime}</Text>
			<Text dimColor> memories: {memoryCount}</Text>
			<Text dimColor>
				{" "}
				tasks: {taskCount} pending
			</Text>
		</Box>
	);
}

function ToolCallsSection() {
	const entries = useLogger("tool");
	const visible = entries.slice(-8);

	return (
		<Box flexDirection="column">
			<Text bold color="yellow">
				Tools
			</Text>
			{visible.length === 0 ? (
				<Text dimColor> waiting...</Text>
			) : (
				visible.map((e) => (
					<Text key={e.id} dimColor wrap="truncate-end">
						{" "}
						⚙ {e.message}
					</Text>
				))
			)}
		</Box>
	);
}

function HeartbeatSection() {
	const entries = useLogger("heartbeat");
	const visible = entries.slice(-5);

	return (
		<Box flexDirection="column">
			<Text bold color="magenta">
				Heartbeat
			</Text>
			{visible.length === 0 ? (
				<Text dimColor> waiting...</Text>
			) : (
				visible.map((e) => (
					<Text key={e.id} dimColor wrap="truncate-end">
						{" "}
						💓 {e.message}
					</Text>
				))
			)}
		</Box>
	);
}


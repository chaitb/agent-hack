import { Box, Spacer, Text, useStdout } from "ink";
import React from "react";
import type { ChatMessage } from "../../core/chat";

interface ChatPanelProps {
	messages: ChatMessage[];
	isStreaming: boolean;
}

// ─── Style config per message variant ────────────────────────────────────────

type Variant = {
	label: string;
	labelColor: string;
	dimLabel?: boolean;
	align?: "left" | "right" | "center";
};

function getVariant(msg: ChatMessage): Variant {
	if (msg.source === "task")
		return {
			label: `${msg.role} [via TASK]`,
			labelColor: "magenta",
			align: "center",
		};
	if (msg.source === "telegram" && msg.role === "user")
		return { label: "TG", labelColor: "blue", align: "right" };

	switch (msg.role) {
		case "user":
			return { label: "You", labelColor: "cyan", align: "right" };
		case "system":
			return {
				label: "sys",
				labelColor: "yellow",
				dimLabel: true,
				align: "center",
			};
		default:
			return { label: "Agent", labelColor: "red" };
	}
}

// ─── Estimate lines a message takes ──────────────────────────────────────────

function estimateLines(msg: ChatMessage, width: number): number {
	// 1 line for label + content lines + 1 for marginBottom
	const contentWidth = Math.max(width - 4, 20); // padding + some margin
	const textLines = msg.content
		.trim()
		.split("\n")
		.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / contentWidth)), 0);
	return 1 + textLines + 1; // label + text lines + margin
}

// ─── Single message component ────────────────────────────────────────────────

function MessageBubble({ msg, streaming }: { msg: ChatMessage; streaming: boolean }) {
	const v = getVariant(msg);

	return (
		<Box marginBottom={1} flexDirection="row">
			{(v.align === "right" || v.align === "center") && <Spacer />}
			<Box
				flexDirection="column"
				width={v.align === "center" ? "60%" : "auto"}
				borderStyle="bold"
				borderLeft={true}
				borderRight={v.align === "center"}
				borderTop={false}
				borderBottom={false}
				paddingX={1}
				borderColor={v.labelColor}
			>
				<Text color={v.labelColor} bold dimColor={v.dimLabel}>
					{v.label}
				</Text>
				<Text wrap="wrap">
					{msg.content.trim()}
					{streaming ? "▊" : ""}
				</Text>
			</Box>
			{(v.align === "center" || v.align === "left") && <Spacer />}
		</Box>
	);
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ChatPanel({ messages, isStreaming }: ChatPanelProps) {
	const { stdout } = useStdout();
	const rows = stdout?.rows ?? 24;
	const cols = stdout?.columns ?? 80;

	// Available height: terminal rows - header(1) - borders(2) - input bar(3)
	const availableRows = rows - 6;

	// Walk backwards from the latest message, accumulating lines until full
	let usedLines = 0;
	let startIdx = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		const lines = estimateLines(messages[i]!, cols * 0.7);
		if (usedLines + lines > availableRows) break;
		usedLines += lines;
		startIdx = i;
	}

	const visible = messages.slice(startIdx);

	return (
		<Box flexDirection="column" flexGrow={1} paddingX={1}>
			{messages.length === 0 ? (
				<Text dimColor>No messages yet. Start chatting!</Text>
			) : (
				visible.map((msg, i) => (
					<MessageBubble
						key={msg.id}
						msg={msg}
						streaming={
							startIdx + i === messages.length - 1 && isStreaming && msg.role === "assistant"
						}
					/>
				))
			)}
		</Box>
	);
}

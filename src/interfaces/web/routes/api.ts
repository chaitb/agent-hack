import type {
	ArtifactContent,
	ArtifactListItem,
	ChatMessage,
	Memory,
	ScoredMemory,
	SerializedLogEntry,
} from "../../../core/model";
import { streamChat as streamChatApi } from "../chatApi";

export const queryKeys = {
	messages: (limit = 20) => ["messages", limit] as const,
	memories: (category: string) => ["memories", category] as const,
	recall: (key: string) => ["recall", key] as const,
	logs: (category: string) => ["logs", category] as const,
	artifacts: () => ["artifacts"] as const,
	artifact: (id: string) => ["artifact", id] as const,
};

export function appendChunk(messages: ChatMessage[], id: string, chunk: string): ChatMessage[] {
	return messages.map((message) =>
		message.id === id ? { ...message, content: message.content + chunk } : message,
	);
}

export async function fetchMessages(limit = 20): Promise<ChatMessage[]> {
	const response = await fetch(`/api/chat/messages?limit=${limit}`);
	if (!response.ok) {
		throw new Error("Failed to load recent chat history.");
	}

	const payload = (await response.json()) as { messages?: ChatMessage[] };
	return Array.isArray(payload.messages) ? payload.messages : [];
}

function parseMemory(value: unknown): Memory | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const candidate = value as {
		id?: unknown;
		key?: unknown;
		value?: unknown;
		category?: unknown;
		access_count?: unknown;
		created_at?: unknown;
		updated_at?: unknown;
	};

	if (
		typeof candidate.id !== "string" ||
		typeof candidate.key !== "string" ||
		typeof candidate.value !== "string" ||
		typeof candidate.category !== "string"
	) {
		return null;
	}

	if (
		candidate.category !== "fact" &&
		candidate.category !== "preference" &&
		candidate.category !== "skill" &&
		candidate.category !== "context"
	) {
		return null;
	}

	return {
		id: candidate.id,
		key: candidate.key,
		value: candidate.value,
		category: candidate.category,
		access_count: typeof candidate.access_count === "number" ? candidate.access_count : 0,
		created_at:
			typeof candidate.created_at === "string" ? new Date(candidate.created_at) : new Date(),
		updated_at:
			typeof candidate.updated_at === "string" ? new Date(candidate.updated_at) : new Date(),
	};
}

function parseScoredMemory(value: unknown): ScoredMemory | null {
	const memory = parseMemory(value);
	if (!memory) {
		return null;
	}

	const score = (value as { score?: unknown }).score;
	if (typeof score !== "number") {
		return null;
	}

	return {
		...memory,
		score,
	};
}

export async function fetchMemories(category = "all"): Promise<Memory[]> {
	const params = new URLSearchParams({ limit: "200" });
	if (category !== "all") {
		params.set("category", category);
	}

	const response = await fetch(`/api/memory?${params.toString()}`);
	if (!response.ok) {
		throw new Error("Failed to load memories.");
	}

	const payload = (await response.json()) as { memories?: unknown[] };
	if (!Array.isArray(payload.memories)) {
		return [];
	}

	return payload.memories.map(parseMemory).filter((memory): memory is Memory => Boolean(memory));
}

export async function fetchRecall(
	key: string,
): Promise<{ found: boolean; results: ScoredMemory[] }> {
	const response = await fetch("/api/memory/recall", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ key }),
	});

	if (!response.ok) {
		throw new Error("Recall request failed.");
	}

	const payload = (await response.json()) as {
		found?: boolean;
		value?: unknown;
	};

	const results = Array.isArray(payload.value)
		? payload.value.map(parseScoredMemory).filter((item): item is ScoredMemory => Boolean(item))
		: [];

	return {
		found: Boolean(payload.found),
		results,
	};
}

export async function fetchLogs(category = "all"): Promise<SerializedLogEntry[]> {
	const params = new URLSearchParams({ limit: "200" });
	if (category !== "all") {
		params.set("category", category);
	}

	const response = await fetch(`/api/logs?${params.toString()}`);
	if (!response.ok) {
		throw new Error("Failed to load logs.");
	}

	const payload = (await response.json()) as { logs?: SerializedLogEntry[] };
	return Array.isArray(payload.logs) ? payload.logs : [];
}

export async function fetchArtifacts(): Promise<ArtifactListItem[]> {
	const response = await fetch("/api/artifacts");
	if (!response.ok) {
		throw new Error("Failed to load artifacts.");
	}

	const payload = (await response.json()) as { artifacts?: ArtifactListItem[] };
	return Array.isArray(payload.artifacts) ? payload.artifacts : [];
}

export async function fetchArtifact(id: string): Promise<ArtifactContent> {
	const response = await fetch(`/api/artifacts/${id}`);
	if (!response.ok) {
		throw new Error("Artifact not found.");
	}

	return (await response.json()) as ArtifactContent;
}

export { streamChatApi as streamChat };

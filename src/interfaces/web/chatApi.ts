export interface StreamChatOptions {
	message: string;
	onStart?: () => void;
	onToken: (chunk: string) => void;
	onDone?: () => void;
	onError?: (message: string) => void;
}

interface ParsedSseEvent {
	event: string;
	data: string;
}

function parseEventBlock(block: string): ParsedSseEvent {
	const lines = block.split("\n");
	let event = "message";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (line.startsWith("event:")) {
			event = line.slice(6).trim();
			continue;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trim());
		}
	}

	return {
		event,
		data: dataLines.join("\n"),
	};
}

function normalizeChunk(buffer: string): string {
	return buffer.replace(/\r\n/g, "\n");
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
	const response = await fetch("/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ message: options.message }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(errorText || `Request failed with status ${response.status}`);
	}

	if (!response.body) {
		throw new Error("Streaming response body was not available.");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		buffer = normalizeChunk(buffer);

		let boundary = buffer.indexOf("\n\n");
		while (boundary >= 0) {
			const block = buffer.slice(0, boundary).trim();
			buffer = buffer.slice(boundary + 2);

			if (block) {
				const event = parseEventBlock(block);
				const payload = event.data ? JSON.parse(event.data) : {};

				switch (event.event) {
					case "start":
						options.onStart?.();
						break;
					case "token":
						if (typeof payload.chunk === "string") {
							options.onToken(payload.chunk);
						}
						break;
					case "done":
						options.onDone?.();
						break;
					case "error":
						options.onError?.(
							typeof payload.message === "string" ? payload.message : "Unknown streaming error.",
						);
						break;
					default:
						break;
				}
			}

			boundary = buffer.indexOf("\n\n");
		}
	}
}

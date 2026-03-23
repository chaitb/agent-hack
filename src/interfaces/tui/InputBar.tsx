import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

interface InputBarProps {
	onSubmit: (text: string) => void;
	disabled: boolean;
}

const ALL_COMMANDS = [
	{ name: "/tasks", description: "List active tasks" },
	{ name: "/memory", description: "Show stored memories" },
	{ name: "/clear", description: "Clear conversation history" },
	{ name: "/help", description: "Show available commands" },
	{ name: "/exit", description: "Quit" },
];

export function InputBar({ onSubmit, disabled }: InputBarProps) {
	const [value, setValue] = useState("");

	const showPalette = value.startsWith("/") && !value.includes(" ");
	const filter = value.slice(1).toLowerCase();
	const filtered = showPalette ? ALL_COMMANDS.filter((c) => c.name.slice(1).includes(filter)) : [];

	const handleSubmit = (text: string) => {
		if (!text.trim() || disabled) return;
		onSubmit(text.trim());
		setValue("");
	};

	return (
		<Box flexDirection="column">
			{showPalette && filtered.length > 0 && (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor="gray"
					paddingX={1}
					marginBottom={0}
				>
					{filtered.map((cmd) => (
						<Box key={cmd.name} gap={1}>
							<Text color="yellow" bold>
								{cmd.name}
							</Text>
							<Text dimColor>{cmd.description}</Text>
						</Box>
					))}
				</Box>
			)}
			<Box
				borderStyle="single"
				borderTop
				borderBottom={false}
				borderLeft={false}
				borderRight={false}
				paddingX={1}
			>
				<Text bold color={disabled ? "gray" : "green"}>
					{"❯ "}
				</Text>
				<TextInput
					value={value}
					onChange={setValue}
					onSubmit={handleSubmit}
					placeholder={disabled ? "Thinking..." : "Type a message..."}
				/>
			</Box>
		</Box>
	);
}

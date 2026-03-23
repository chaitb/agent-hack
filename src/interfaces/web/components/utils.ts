export function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}

export const uiFontClass = "font-['Raleway',sans-serif]";

import type { ThemeMode } from "../theme";
import { cx, uiFontClass } from "./utils";

export function ModeToggle({
	mode,
	onChange,
}: {
	mode: ThemeMode;
	onChange: (nextMode: ThemeMode) => void;
}) {
	const options: Array<{ mode: ThemeMode; label: string }> = [
		{ mode: "system", label: "System" },
		{ mode: "light", label: "Light" },
		{ mode: "dark", label: "Dark" },
	];

	return (
		<div className="inline-flex gap-1 rounded-[0.9rem] border border-muted-primary/35 bg-bg-muted p-1">
			{options.map((option) => {
				const isActive = option.mode === mode;
				return (
					<button
						key={option.mode}
						type="button"
						onClick={() => onChange(option.mode)}
						aria-pressed={isActive}
						className={cx(
							"rounded-[0.7rem] border-0 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-muted-primary transition-colors",
							"hover:text-primary",
							uiFontClass,
							isActive && "bg-accent/30 text-primary",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

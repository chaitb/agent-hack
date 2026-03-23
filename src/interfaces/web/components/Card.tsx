import type { ReactNode } from "react";
import { cx } from "./utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cx(
				"rounded-[1.25rem] border p-5",
				"border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)]",
				"bg-bg-card shadow-[0_10px_24px_color-mix(in_srgb,var(--bg)_40%,transparent)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

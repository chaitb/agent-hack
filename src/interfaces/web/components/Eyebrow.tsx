import type { ReactNode } from "react";
import { cx, uiFontClass } from "./utils";

export function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p
			className={cx(
				"mb-1 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-[var(--muted-primary)]",
				uiFontClass,
			)}
		>
			{children}
		</p>
	);
}

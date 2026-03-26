import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, uiFontClass } from "./utils";

export function StatusPill({ children }: { children: ReactNode }) {
	return (
		<div
			className={cx(
				"inline-flex items-center gap-1 rounded-full bg-accent/30 px-3 py-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-primary",
				uiFontClass,
			)}
		>
			{children}
		</div>
	);
}

export interface ButtonPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
}

export function ButtonPill({ children, className, type = "button", ...props }: ButtonPillProps) {
	return (
		<button
			type={type}
			className={cx(
				"inline-flex items-center gap-1 rounded-full bg-bg-muted/30 backdrop-blur px-3 py-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-accent/30",
				uiFontClass,
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}

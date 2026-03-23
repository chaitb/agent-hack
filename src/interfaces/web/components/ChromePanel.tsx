import type { ReactNode } from "react";
import { cx } from "./utils";

export function ChromePanel({
	children,
	className,
	as = "section",
}: {
	children: ReactNode;
	className?: string;
	as?: "section" | "div" | "header";
}) {
	const Tag = as;
	return (
		<Tag
			className={cx(
				"border-[color-mix(in_srgb,var(--muted-primary)_35%,transparent)]",
				"bg-[color-mix(in_srgb,var(--bg-card)_94%,var(--bg))]",
				"shadow-[0_18px_50px_color-mix(in_srgb,var(--bg)_55%,transparent)]",
				"backdrop-blur-[16px] md:rounded-[1.5rem] md:border",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

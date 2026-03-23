import type { ReactNode } from "react";
import { cx, uiFontClass } from "./utils";

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className={cx("flex items-center justify-between gap-4", uiFontClass)}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

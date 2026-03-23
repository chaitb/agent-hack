import { Link } from "wouter";
import { ButtonPill } from "../components";

const NAV_LINKS = [
	{ href: "/chat", label: "CHAT" },
	{ href: "/memory", label: "MEMORY" },
	{ href: "/recall", label: "RECALL" },
	{ href: "/logs", label: "LOGS" },
] as const;

export function NavTabs({ location }: { location: string }) {
	return (
		<nav className="flex flex-wrap gap-2">
			{NAV_LINKS.map((link) => (
				<Link key={link.href} href={link.href}>
					<ButtonPill
						className={
							location === link.href || (link.href === "/chat" && location === "/")
								? "bg-accent/40"
								: undefined
						}
					>
						{link.label}
					</ButtonPill>
				</Link>
			))}
		</nav>
	);
}

import { Link } from "wouter";
import { ButtonPill } from "../components";

const NAV_LINKS = [
	{ href: "/chat", label: "CHAT" },
	{ href: "/memory", label: "MEMORY" },
	{ href: "/recall", label: "RECALL" },
	{ href: "/artifacts", label: "ARTIFACTS" },
	{ href: "/logs", label: "LOGS" },
] as const;

export function NavTabs({ location, children }: { location: string; children?: React.ReactNode }) {
	return (
		<header className="max-w-screen-lg mx-auto">
			<nav className="flex gap-2 p-2">
				<div className="flex gap-2 grow">
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
				</div>
				{children}
			</nav>
		</header>
	);
}

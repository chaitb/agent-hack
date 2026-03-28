import { createContext, type ReactNode, useContext, useState } from "react";
import { useLocation } from "wouter";
import { NavTabs } from "../routes/NavTabs";
import { useTheme } from "../theme";
import { ButtonPill, ChromePanel, Eyebrow, ModeToggle, StatusPill, uiFontClass } from ".";

type SidebarContextValue = {
	showSidebar: boolean;
	toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
	const ctx = useContext(SidebarContext);
	if (!ctx) {
		throw new Error("useSidebar must be used within DefaultLayout");
	}
	return ctx;
}

function toRouteLabel(location: string): string {
	if (location === "/memory") return "/memory";
	if (location === "/recall") return "/recall";
	if (location.startsWith("/artifacts")) return "/artifacts";
	if (location === "/logs") return "/logs";
	return "/chat";
}

function SidebarToggleButton() {
	const { showSidebar, toggleSidebar } = useSidebar();
	return <ButtonPill onClick={toggleSidebar}>{showSidebar ? "HIDE" : "INFO"}</ButtonPill>;
}

export function DefaultLayout({ children }: { children: ReactNode }) {
	const { mode, resolvedTheme, setMode } = useTheme();
	const [location] = useLocation();
	const [showSidebar, setShowSidebar] = useState(false);

	const routeLabel = toRouteLabel(location);
	const toggleSidebar = () => setShowSidebar((v) => !v);

	return (
		<SidebarContext.Provider value={{ showSidebar, toggleSidebar }}>
			<NavTabs location={location}>
				<SidebarToggleButton />
			</NavTabs>
			<div className="flex gap-2 p-2">
				<ChromePanel
					className="mx-auto flex h-screen max-h-screen w-full max-w-screen-lg flex-col overflow-hidden md:max-h-[calc(100vh-5rem)]"
					as="section"
				>
					<header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)] px-7 pb-4 pt-6">
						<div className="flex flex-grow flex-col gap-3">
							<h2 className={`text-2xl font-semibold text-primary ${uiFontClass}`}>{routeLabel}</h2>
						</div>
						<StatusPill>Ready</StatusPill>
					</header>

					<div className="min-h-0 flex flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-card)_80%,var(--bg))_0%,color-mix(in_srgb,var(--bg-muted)_75%,var(--bg))_100%)] px-7 py-6 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent [&::-webkit-scrollbar]:w-1.5">
						{children}
					</div>
				</ChromePanel>

				{showSidebar && (
					<ChromePanel className="h-full flex flex-col gap-6 p-7">
						<div className="space-y-4">
							<Eyebrow>Zen Chat Interface</Eyebrow>
							<h1
								className={`m-0 text-[clamp(2rem,3vw,3rem)] font-semibold tracking-[-0.04em] ${uiFontClass}`}
							>
								Mnemosyne Settings
							</h1>
							<p className="m-0 text-[0.98rem] leading-8 text-muted-primary">
								A browser surface over the same agent runtime, memory store, and task loop used by
								the TUI.
							</p>
						</div>

						<div className="rounded-[1.2rem] border border-[color-mix(in_srgb,var(--muted-primary)_32%,transparent)] bg-bg-card p-5 space-y-3">
							<Eyebrow>Appearance</Eyebrow>
							<ModeToggle mode={mode} onChange={setMode} />
							<p className="text-sm text-muted-primary">
								Using{" "}
								<span className={`font-semibold uppercase ${uiFontClass}`}>{resolvedTheme}</span>{" "}
								theme {mode === "system" ? "(following system)" : "(manually selected)"}.
							</p>
						</div>
					</ChromePanel>
				)}
			</div>
		</SidebarContext.Provider>
	);
}

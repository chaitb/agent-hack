import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
	mode: ThemeMode;
	resolvedTheme: ResolvedTheme;
	setMode: (nextMode: ThemeMode) => void;
};

const THEME_STORAGE_KEY = "pocket-bot-theme-mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined") {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "system";
	}

	const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (storedMode === "system" || storedMode === "light" || storedMode === "dark") {
		return storedMode;
	}

	return "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
	return mode === "system" ? getSystemTheme() : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [mode, setModeState] = useState<ThemeMode>(() => readInitialMode());
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const handleChange = (event: MediaQueryListEvent) => {
			setSystemTheme(event.matches ? "dark" : "light");
		};

		setSystemTheme(mediaQuery.matches ? "dark" : "light");
		mediaQuery.addEventListener("change", handleChange);

		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, []);

	const setMode = useCallback((nextMode: ThemeMode) => {
		setModeState(nextMode);
		window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
	}, []);

	const resolvedTheme = mode === "system" ? systemTheme : mode;

	useEffect(() => {
		document.documentElement.dataset.theme = resolvedTheme;
		document.documentElement.dataset.themeMode = mode;
	}, [mode, resolvedTheme]);

	const value = useMemo(
		() => ({
			mode,
			resolvedTheme,
			setMode,
		}),
		[mode, resolvedTheme, setMode],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
}

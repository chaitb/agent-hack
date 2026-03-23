import { createRoot } from "react-dom/client";
import "./styles.css";
import { ThemeProvider } from "./theme";
import { WebApp } from "./WebApp";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found for /chat.");
}

createRoot(rootElement).render(
	<ThemeProvider>
		<WebApp />
	</ThemeProvider>,
);

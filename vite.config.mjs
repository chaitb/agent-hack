import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		host: "localhost",
		port: 5173,
		strictPort: true,
		proxy: {
			"/api": {
				target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist/web",
		emptyOutDir: true,
		rollupOptions: {
			input: "src/interfaces/web/client.tsx",
			output: {
				entryFileNames: "client.js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: (assetInfo) => {
					if (assetInfo.name?.endsWith(".css")) {
						return "app.css";
					}

					return "assets/[name]-[hash][extname]";
				},
			},
		},
	},
});

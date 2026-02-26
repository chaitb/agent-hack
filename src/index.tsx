import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { logger } from "./logger";

// Capture any stray console.log from third-party libs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: unknown[]) => {
	logger.push("system", args.map(String).join(" "));
};
console.error = (...args: unknown[]) => {
	logger.push("system", `[err] ${args.map(String).join(" ")}`);
};
console.warn = (...args: unknown[]) => {
	logger.push("system", `[warn] ${args.map(String).join(" ")}`);
};

render(<App />);

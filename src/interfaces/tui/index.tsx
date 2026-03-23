import "dotenv/config";
import { render } from "ink";
import { logger } from "../../core/logger";
import { TuiApp } from "./App";

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

render(<TuiApp />);

void originalLog;
void originalError;
void originalWarn;

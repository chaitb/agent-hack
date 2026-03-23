# Pocket Bot 2

Pocket Bot 2 is a Bun-based personal agent application with:

- a TUI built with Ink
- a Bun web server that serves the chat UI at `GET /chat`
- a maintenance CLI for DB migrations and embedding reindexing

The app is structured so interface code is separate from shared app logic, persistence, and runtime composition.

## Architecture

- `src/core/`
  Agent, chat service, heartbeat, logs, models, and tools.

- `src/persistence/`
  Turso/LibSQL database layer and embedding helpers.

- `src/runtime/`
  Shared runtime bootstrap and external integrations.

- `src/interfaces/tui/`
  Ink TUI entrypoint and panels.

- `src/interfaces/web/`
  Bun server, browser client, `/chat` page, SSE transport, and Tailwind CSS.

- `src/interfaces/cli.ts`
  DB and embedding maintenance commands.

More detailed contributor guidance lives in [AGENTS.md](/Users/chaitb/projects/pocket-bot-2/AGENTS.md).

## Requirements

- Bun
- Turso/LibSQL credentials

Expected environment variables:

- `TURSO_CONNECTION_URL`
- `TURSO_AUTH_TOKEN`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for Telegram integration
- `NOTION_API_TOKEN` for Notion tools
- `PORT` for the web server, optional

## Setup

Install dependencies:

```bash
bun install
```

## Development

Run the TUI in watch mode:

```bash
bun run dev:tui
```

Run the web server, browser bundle, and Tailwind watcher together:

```bash
bun run dev:web
```

Run the Tailwind watcher only:

```bash
bun run dev:css
```

## Running

Start the web server:

```bash
bun run start:web
```

Start the TUI:

```bash
bun run start:tui
```

Run the maintenance CLI:

```bash
bun run pocket --help
```

## Build

Build web assets:

```bash
bun run build:web
```

Build the TUI bundle:

```bash
bun run build:tui
```

## Testing and Verification

Run tests:

```bash
bun test
```

Run typecheck:

```bash
bunx tsc --noEmit
```

Recommended verification after changes:

```bash
bun test
bun run build:web
bun run build:tui
bunx tsc --noEmit
```

If you change runtime boot paths, also smoke-test:

```bash
bun run start:web
bun run start:tui
```

## Notes

- The browser chat page is served at `GET /chat`.
- Chat requests stream over SSE via `POST /api/chat`.
- The web UI design system is derived from `Zen Chat Interface/code.html`.
- The live runtime depends on Turso connectivity; local boot will fail without reachable DB credentials.

## Status

Active refactor and verification tasks are tracked in [PROGRESS.md](/Users/chaitb/projects/pocket-bot-2/PROGRESS.md).

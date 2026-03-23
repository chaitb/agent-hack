# AGENTS.md

## Purpose

This repository is a Bun application with three user-facing surfaces:

- a TUI built with Ink
- a web interface served by Bun at `GET /chat`
- a CLI for DB maintenance and embedding reindexing

The application is organized so interface code is separate from core app logic, persistence, and runtime composition.

## Project Map

- `src/core/`
  Shared application logic.
  Contains the agent, chat service, heartbeat, logging bus, models, and tool definitions.

- `src/persistence/`
  Database and embedding logic.
  `database.ts` is the Turso/LibSQL persistence layer.

- `src/runtime/`
  Runtime composition and external integrations.
  `createAppRuntime.ts` is the shared bootstrap path for DB + agent + optional heartbeat/Telegram.

- `src/interfaces/tui/`
  Ink-based TUI entrypoint and panels.

- `src/interfaces/web/`
  Bun web server, `/chat` page renderer, browser client, SSE transport, and Tailwind CSS.

- `src/interfaces/cli.ts`
  Maintenance CLI for migrations, data clearing, and embedding reindexing.

- `instructions/`
  Markdown instruction files loaded into the agent system prompt.

- `PROGRESS.md`
  Active refactor/verification checklist. Read this before starting work.

## Entry Points

- TUI:
  `src/interfaces/tui/index.tsx`

- Web server:
  `src/interfaces/web/server.ts`

- Browser client:
  `src/interfaces/web/client.tsx`

- Maintenance CLI:
  `src/interfaces/cli.ts`

## Runtime Rules

- Prefer `createAppRuntime()` for any new interface or service that needs DB + agent access.
- Do not duplicate DB/agent bootstrap logic inside interface code.
- Heartbeat and Telegram are opt-in runtime features. Enable them explicitly per entrypoint.
- The browser and TUI are intended to talk to the same shared agent/session model.

## Web Contract

- `GET /chat`
  Serves the chat page shell and embeds recent messages.

- `POST /api/chat`
  Accepts JSON `{ "message": string }`.
  Returns SSE with these events:
  - `start`
  - `token`
  - `done`
  - `error`

- Browser-originated persisted messages should use `source = "web"`.

## UI / Design Rules

- The web UI uses Tailwind v4 from `src/interfaces/web/styles.css`.
- The design system is derived from `Zen Chat Interface/code.html`.
- Preserve the current visual direction:
  - warm light background
  - serif body typography
  - sans-serif UI typography
  - soft borders/cards
  - asymmetric user/assistant chat bubbles
- Prefer adding semantic component classes in `styles.css` over scattering large ad hoc utility strings.

## Commands

- Install deps:
  `bun install`

- Run TUI in dev:
  `bun run dev:tui`

- Run web in dev:
  `bun run dev:web`

- Run CSS watcher only:
  `bun run dev:css`

- Run maintenance CLI:
  `bun run pocket --help`

- Start web server:
  `bun run start:web`

- Start TUI:
  `bun run start:tui`

- Build web assets:
  `bun run build:web`

- Build TUI bundle:
  `bun run build:tui`

- Run tests:
  `bun test`

- Run typecheck:
  `bunx tsc --noEmit`

## Environment

Expected environment variables include:

- `TURSO_CONNECTION_URL`
- `TURSO_AUTH_TOKEN`
- `TELEGRAM_BOT_TOKEN` for Telegram integration
- `TELEGRAM_CHAT_ID` for proactive Telegram sends
- `NOTION_API_TOKEN` for Notion tools
- `PORT` for the Bun web server, optional

Without Turso connectivity, the runtime entrypoints will fail to boot.

## Working Conventions

- Keep layers separate:
  - interfaces should render, collect input, and call shared services
  - core should own agent/chat behavior
  - persistence should own DB concerns
  - runtime should compose dependencies
- When adding new tools, put them under `src/core/tools/` and wire them through `src/core/tools/index.ts`.
- When adding new message sources, update `src/core/model/message.ts` and verify persistence/UI handling.
- Prefer small, testable helpers for web request handling. `createWebHandler()` is the pattern to follow.
- Add or update tests when changing HTTP behavior or serialization contracts.

## Verification Expectations

Before closing work, run as many of these as the environment allows:

- `bun test`
- `bun run build:web`
- `bun run build:tui`
- `bunx tsc --noEmit`

If you touch runtime boot paths, also smoke-test:

- `bun run start:web`
- `bun run start:tui`

If those fail because Turso is unreachable, call that out explicitly rather than treating it as an app code regression.

## Current Known Gaps

From `PROGRESS.md`, these still need live-environment verification:

- CLI DB commands against a real Turso database
- persistence of web-originated chat messages with `source = "web"`
- full smoke test of TUI and web entrypoints with network access

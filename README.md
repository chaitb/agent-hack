# CB's Agent

A proactive, long-lived personal AI assistant with persistent memory, hybrid search, and multi-channel communication. Built with Bun, Vercel AI SDK, Anthropic Claude, and Turso.

## Tech Highlights

|                    |                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**        | Bun + TypeScript, split-panel TUI via Ink (React for terminal)                                                                                                                                                 |
| **LLM**            | Claude Sonnet 4 via Vercel AI SDK — `generateText`/`streamText` with `stopWhen` tool loop                                                                                                                      |
| **Memory**         | Hybrid retrieval: **70% vector** (OpenAI `text-embedding-3-small`, 1024-dim `F32_BLOB` in Turso) + **30% BM25** (FTS5 virtual table, trigger-synced) — deduped and re-ranked                                   |
| **Context**        | Tiered injection with 2000-token budget: preferences always, recent context if room, facts/skills tool-only                                                                                                    |
| **Storage**        | Turso (libsql) — 6 tables: `messages`, `memory`, `memory_fts`, `tasks`, `tool_usage`, `instructions`                                                                                                           |
| **Tools**          | 20 tools across 6 namespaces, unified `createToolHandler` wrapper with automatic error handling, logging, and `tool_usage` tracking (FK to assistant message)                                                  |
| **Channels**       | CLI + Telegram (grammY, long polling, MarkdownV2) + email (interface ready). Unified timeline — all channels share one session. Message dedup via `telegram_message_id` in JSON metadata with `json_extract()` |
| **Proactive**      | 60s heartbeat polls task queue, executes due tasks through the agent, reschedules recurring ones                                                                                                               |
| **Self-modifying** | Agent reads/writes its own `instructions/` directory — system prompt, communication style, user profile. Feedback → `update_instructions` tool → behavior changes persist                                      |
| **Integrations**   | Notion via `@notionhq/client` (search, pages, databases, blocks)                                                                                                                                               |
| **Observability**  | All logs to `logs/agent.log`, tool calls tracked with input/output/duration/error in DB, live TUI right panel                                                                                                  |

## What It Does

- **Single continuous session** — no separate conversations. CLI, Telegram, and email all append to one unified timeline. The agent remembers everything across channels.
- **Proactive** — a 60-second heartbeat polls a task queue, executes due tasks, and messages you via Telegram/email without being prompted.
- **Self-improving** — the agent reads and writes its own instruction files. Give it feedback and it updates its own behavior.
- **Hybrid memory search** — 70% vector similarity (OpenAI embeddings) + 30% BM25 keyword search, stored in Turso with native vector columns and FTS5.

## Setup

### Prerequisites

- [Bun](https://bun.sh) (runtime)
- [Turso](https://turso.tech) database
- Anthropic API key (Claude Sonnet 4)
- OpenAI API key (embeddings only — `text-embedding-3-small`)
- Telegram bot token (optional — via [@BotFather](https://t.me/BotFather))
- Notion integration token (optional — from [notion.so/my-integrations](https://www.notion.so/my-integrations))

### Install

```bash
bun install
```

### Environment Variables

Create a `.env` file:

```
# Required
ANTHROPIC_API_KEY=sk-ant-...
TURSO_CONNECTION_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
OPENAI_API_KEY=sk-...

# Optional
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
NOTION_API_TOKEN=ntn_...
```

### Run

```bash
bun start        # Start the agent
bun run dev      # Watch mode with hot reload
```

## TUI Layout

Split-panel terminal UI built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal):

```
┌─────────────────────────────┬──────────────────────────┐
│  Chat                       │  System Info             │
│                             │   model: sonnet-4        │
│  You: remind me at 3pm     │   uptime: 5m             │
│  Agent: Done. Scheduled.    │   memories: 12           │
│                             │   tasks: 3 pending       │
│  [TG] hey what's up        │                          │
│  Agent: Not much! You have  │  Tool Calls              │
│  a call at 3pm.             │   tasks.schedule: ok     │
│                             │   memory.recall: ok      │
│                             │                          │
│                             │  Heartbeat               │
│  ❯ [input]                  │   💓 0 tasks due         │
└─────────────────────────────┴──────────────────────────┘
```

### CLI Commands

Type `/` to see the command palette:

| Command   | Description                |
| --------- | -------------------------- |
| `/tasks`  | List active tasks          |
| `/memory` | Show stored memories       |
| `/clear`  | Clear conversation history |
| `/help`   | Show available commands    |
| `/exit`   | Quit                       |

## Architecture

### Core Loop

```
User input (CLI / Telegram / Email)
  → db.saveMessage()        # unified timeline
  → db.saveMessage("assistant", "")  # placeholder for tool_usage FK
  → buildSystemPrompt()     # tiered context assembly
  → generateText/streamText # Claude Sonnet 4 with tools
  → db.updateMessageContent()  # fill in response
  → chatBus.push()          # update all UIs in real time
```

### Memory System

**Hybrid search** — every memory gets a 1024-dim embedding (Mistral) stored as `F32_BLOB(1024)` in Turso, plus an FTS5 index for keyword search.

| Method        | How                                                 |
| ------------- | --------------------------------------------------- |
| Vector search | `vector_distance_cos()` on Turso native vectors     |
| BM25 search   | FTS5 virtual table `memory_fts` synced via triggers |
| Hybrid search | 70% vector + 30% BM25, deduped, re-ranked           |

**Tiered system prompt injection** (2000-token budget):

| Tier          | Category        | Injected?                                      |
| ------------- | --------------- | ---------------------------------------------- |
| 1 (always)    | `preference`    | Yes — defines user identity                    |
| 2 (if budget) | `context`       | Top 5 most recent                              |
| 3 (never)     | `fact`, `skill` | Agent uses `recall` tool with `mode: "search"` |

### Tool System

All tools use `createToolHandler()` — a unified wrapper that:

- Catches errors and returns `{ success: false, error }` consistently
- Logs execution time: `namespace.name: ok (123ms)`
- Saves to `tool_usage` table with FK to the assistant message that triggered it

| Namespace | Tools                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| `memory`  | remember, recall (exact + semantic), recall_all, forget                                       |
| `tasks`   | schedule, list, update, cancel                                                                |
| `files`   | read, write, list, read_instructions, update_instructions, list_skills                        |
| `comm`    | send_telegram, send_email, notify                                                             |
| `notion`  | search, get_page, create_page, update_page, query_database, append_blocks, get_block_children |
| `utility` | get_current_time, done                                                                        |

### Channels

| Channel  | Adapter        | How                                                                            |
| -------- | -------------- | ------------------------------------------------------------------------------ |
| CLI      | Ink TUI        | Split panel, streaming responses, command palette                              |
| Telegram | grammY (`Bot`) | Long polling, MarkdownV2 escaping, dedup via `telegram_message_id` in metadata |
| Email    | (stub)         | `CommChannels.email` interface ready to wire                                   |

### Heartbeat

`setInterval(60s)` in the same Bun process:

1. Query `tasks` table for due items
2. Execute via `agent.run()` (source: `"task"`)
3. Reschedule recurring tasks (supports `every Nm`, `every Nh`, `daily HH:MM`)

### Self-Improvement

The `instructions/` directory contains the agent's identity:

```
instructions/
├── system-prompt.md         # Core behavior rules
├── communication-style.md   # Response tone/format
└── user-profile.md          # Auto-updated by agent
```

The agent can read and write these files via `update_instructions` tool. Feedback like "always respond in bullet points" → agent updates `communication-style.md` → future calls use the updated instructions.

## Database Schema (Turso/LibSQL)

### `messages`

Unified timeline across all channels.

| Column     | Type     | Description                                |
| ---------- | -------- | ------------------------------------------ |
| id         | TEXT PK  | UUID                                       |
| role       | TEXT     | user, assistant, system, tool              |
| content    | TEXT     | Message text                               |
| source     | TEXT     | cli, telegram, email, heartbeat, task      |
| metadata   | TEXT     | JSON — e.g. `{ telegram_message_id: 123 }` |
| created_at | DATETIME | Timestamp                                  |

### `memory`

Long-term knowledge with embeddings.

| Column       | Type           | Description                          |
| ------------ | -------------- | ------------------------------------ |
| id           | TEXT PK        | UUID                                 |
| key          | TEXT UNIQUE    | Semantic key (e.g. `user.timezone`)  |
| value        | TEXT           | Stored value                         |
| category     | TEXT           | preference, fact, skill, context     |
| embedding    | F32_BLOB(1024) | OpenAI text-embedding-3-small vector |
| access_count | INTEGER        | Times recalled                       |
| created_at   | DATETIME       | First created                        |
| updated_at   | DATETIME       | Last modified                        |

### `memory_fts`

FTS5 virtual table for BM25 keyword search, auto-synced via triggers.

### `tasks`

Scheduled and recurring task queue.

| Column       | Type     | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| id           | TEXT PK  | UUID                                           |
| title        | TEXT     | Task name                                      |
| description  | TEXT     | Full prompt for agent                          |
| status       | TEXT     | pending, running, completed, failed, cancelled |
| priority     | INTEGER  | 0-10                                           |
| scheduled_at | DATETIME | When to execute                                |
| recurrence   | TEXT     | e.g. `every 30m`, `daily 09:00`                |
| last_run_at  | DATETIME | Last execution                                 |
| result       | TEXT     | Output from last run                           |

### `tool_usage`

Tracks every tool call with FK to the assistant message.

| Column      | Type    | Description                  |
| ----------- | ------- | ---------------------------- |
| id          | TEXT PK | UUID                         |
| message_id  | TEXT FK | Links to messages.id         |
| namespace   | TEXT    | e.g. `memory`, `notion`      |
| name        | TEXT    | e.g. `recall`, `create_page` |
| input       | TEXT    | JSON of tool input           |
| result      | TEXT    | success or failure           |
| output      | TEXT    | JSON of tool output          |
| error       | TEXT    | Error message if failed      |
| duration_ms | INTEGER | Execution time               |

### `instructions`

Index of agent instruction files on disk.

## Project Structure

```
src/
├── index.tsx               # Entry point — renders Ink app, captures console
├── agent.ts                # Agent class — run(), stream(), buildSystemPrompt()
├── memory.ts               # DB class — all tables, CRUD, hybrid search
├── embeddings.ts           # OpenAI embedding via Vercel AI SDK
├── heartbeat.ts            # 60s task poller
├── telegram.ts             # Telegram adapter (grammY) + MarkdownV2 escaping
├── logger.ts               # EventEmitter log store + chatBus + file logging
├── model/
│   ├── index.ts            # Barrel re-export
│   ├── message.ts          # Message, MessageRole, MessageSource
│   ├── memory.ts           # Memory, ScoredMemory, MemoryCategory
│   ├── task.ts             # Task, TaskStatus
│   ├── instruction.ts      # InstructionRecord
│   └── tool-usage.ts       # ToolUsage, ToolResult
├── tools/
│   ├── index.ts            # createAllTools() barrel
│   ├── createToolHandler.ts # Unified tool wrapper (logging, error handling, DB tracking)
│   ├── memory.ts           # remember, recall (hybrid search), recall_all, forget
│   ├── tasks.ts            # schedule, list, update, cancel
│   ├── files.ts            # read, write, list, instructions, skills
│   ├── communication.ts    # send_telegram, send_email, notify
│   ├── notion.ts           # search, pages, databases, blocks
│   └── utility.ts          # get_current_time, done
└── ui/
    ├── App.tsx             # Root layout — init, split panels, command handling
    ├── ChatPanel.tsx       # Left panel — messages with variant styling
    ├── InputBar.tsx        # Text input + command palette
    ├── LogsPanel.tsx       # Right panel — system info, tool calls, heartbeat
    ├── useLogger.ts        # React hook for log subscription
    └── useStreamAgent.ts   # React hook for streaming + chatBus integration

instructions/               # Agent's self-modifiable identity
├── system-prompt.md
├── communication-style.md
└── user-profile.md

logs/                       # Raw logs (gitignored)
└── agent.log
```

## Logging

All logs written to `logs/agent.log` with format:

```
2026-02-26T12:00:00.000Z [SYSTEM       ] Database connected
2026-02-26T12:00:05.000Z [TOOL         ] memory.remember: ok (230ms)
2026-02-26T12:00:05.000Z [CHAT         ] [telegram] user: hey
2026-02-26T12:00:06.000Z [HEARTBEAT    ] 1 task(s) due
```

Both `logger.push()` (system/tool/heartbeat events) and `chatBus.push()` (all messages) write to the file. `console.log/error/warn` are overridden to route through the logger.

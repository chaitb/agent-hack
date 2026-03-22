# Technical Implementation Details

## 1. Agent Loop

The agent uses Vercel AI SDK's `generateText`/`streamText` with `stopWhen: [stepCountIs(25), hasToolCall("done")]` — the LLM calls tools in a loop until it's done or hits 25 steps.

**Context assembly** happens in `buildSystemPrompt()` before every LLM call. It's not a static system prompt — it's rebuilt dynamically from four sources:

1. **Instruction files** — read from `instructions/` directory on disk
2. **Preference memories** — always injected (tier 1, defines user identity)
3. **Recent context memories** — top 5 by recency if token budget allows (tier 2)
4. **Active tasks** — pending tasks with priority and schedule

Facts and skills are never injected. The system prompt tells the agent: _"Use `recall` with `mode: search` to find relevant memories."_ This keeps context lean and forces the agent to retrieve on-demand.

**Token budget**: 2000 tokens (~8000 chars). Memories are added one at a time; the loop stops when the budget is exhausted.

### Message Placeholder Pattern

Tool calls are made by the assistant, but the assistant message doesn't exist yet when tools fire (it's completed after streaming). To link `tool_usage` records to the correct message:

1. `saveMessage("assistant", "")` — creates an empty placeholder, gets an ID
2. `db.currentMessageId = placeholder.id` — tools read this during execution
3. LLM runs, tools fire, each `tool_usage` row gets `message_id = placeholder.id`
4. `updateMessageContent(id, fullText)` — fills in the actual response
5. `chatBus.push()` — emits the completed message to all UIs

The empty placeholder doesn't emit on chatBus (guarded by `if (content)` check), so no blank bubble appears.

---

## 2. Hybrid Memory Search

Every memory stored via the `remember` tool gets a 1024-dim embedding from Mistral's `mistral-embed` (via Vercel AI SDK's `embed()`), stored as `F32_BLOB(1024)` in Turso's native vector column.

An FTS5 virtual table (`memory_fts`) is kept in sync via three SQLite triggers:

```sql
-- On INSERT: add to FTS index
CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN
  INSERT INTO memory_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
END;

-- On DELETE: remove from FTS index
CREATE TRIGGER memory_ad AFTER DELETE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, key, value) VALUES ('delete', old.rowid, old.key, old.value);
END;

-- On UPDATE: remove old, add new
CREATE TRIGGER memory_au AFTER UPDATE ON memory BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, key, value) VALUES ('delete', old.rowid, old.key, old.value);
  INSERT INTO memory_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
END;
```

### Search Pipeline

When the agent calls `recall` with `mode: "search"`:

1. **Vector search** — `vector_distance_cos(embedding, vector(?))` on Turso. Returns top N by cosine distance. Score normalized: `1 - distance`.

2. **BM25 search** — `memory_fts MATCH ?` with `bm25()` ranking. BM25 returns negative scores (lower = more relevant), normalized: `max(0, 1 + rank * 0.1)`.

3. **Hybrid blend** — Results merged by key. Vector score weighted 70%, BM25 weighted 30%. Duplicates accumulate both scores. Final list sorted by combined score descending.

```
user query: "what do you know about my health?"
  → getEmbedding("what do you know about my health?")
  → vectorSearch(embedding, 10)  → [{key: "user.dentist", score: 0.82}, ...]
  → bm25Search("health", 10)    → [{key: "user.dentist", score: 0.45}, ...]
  → merge: "user.dentist" = 0.82 * 0.7 + 0.45 * 0.3 = 0.709
  → return sorted by combined score
```

### Access Tracking

Every `recall()` (exact mode) increments `access_count` on the matched row:

```sql
UPDATE memory SET access_count = access_count + 1 WHERE key = ? RETURNING value
```

This enables future features like "most frequently accessed" or decay-based relevance.

---

## 3. Tool System

### `createToolHandler()` Wrapper

Every tool (20 total) is built with a single factory function that standardizes behavior:

```ts
createToolHandler({
  namespace: "notion",
  name: "create_page",
  description: "...",
  db,
  inputSchema: z.object({ ... }),
  execute: async (input) => {
    // just the happy path — no try/catch needed
    const page = await notion.pages.create(...);
    return { success: true, page_id: page.id };
  },
})
```

The wrapper adds:

- **try/catch** — execute functions just throw on error; the wrapper catches and returns `{ success: false, error }`
- **Timing** — `performance.now()` before and after, logged as `namespace.name: ok (123ms)`
- **DB tracking** — `saveToolUsage()` with input, output, duration, error, and FK to `db.currentMessageId`
- **Fire-and-forget** — the DB write uses `.catch(() => {})` so it doesn't add latency to the tool response

### Tool Namespaces

| Namespace | Count | Injected Dependencies                              |
| --------- | ----- | -------------------------------------------------- |
| `memory`  | 4     | DB, embeddings                                     |
| `tasks`   | 4     | DB                                                 |
| `files`   | 6     | DB, filesystem                                     |
| `comm`    | 3     | DB, CommChannels (telegram/email send functions)   |
| `notion`  | 7     | @notionhq/client (disabled if no token)            |
| `utility` | 2     | DB (get_current_time), none (done — no execute fn) |

The `done` tool has no `execute` function — calling it triggers `hasToolCall("done")` in `stopWhen`, which terminates the agent loop. This is Vercel AI SDK's pattern for forced tool calling termination.

---

## 4. Unified Timeline & ChatBus

There are no separate conversations. Every message from every channel writes to the same `messages` table with a `source` column (`cli`, `telegram`, `email`, `heartbeat`, `task`).

### Real-time UI Sync

`chatBus` is an EventEmitter singleton. When `db.saveMessage()` is called (from any source), it emits a `"message"` event. The React hook `useStreamAgent` subscribes:

```
Telegram message → agent.run() → db.saveMessage("user", ...) → chatBus emits → React setState → TUI re-renders
```

### Streaming Suppression

For CLI streaming, chunks are rendered locally via `setMessages()` — the chatBus would emit a duplicate when the final `updateMessageContent()` fires. A `useRef` flag (`suppressCliRef`) handles this:

1. Set `true` before streaming starts
2. chatBus handler skips events where `source === "cli" && role === "assistant"` while flag is true
3. Reset `false` after 500ms (enough time for the final DB write to emit and be ignored)

This is a ref (not state) because it needs to be read synchronously inside the event handler without triggering re-renders.

### Telegram Dedup

Telegram can deliver the same message multiple times (retries, polling overlap). Each message's `message_id` is stored in the `metadata` JSON column:

```json
{
	"telegram_message_id": 12345,
	"telegram_chat_id": 67890,
	"telegram_user": "Chait"
}
```

Before processing, the adapter checks:

```sql
SELECT 1 FROM messages WHERE json_extract(metadata, '$.telegram_message_id') = ? LIMIT 1
```

If it exists, the message is skipped.

---

## 5. Heartbeat

A `setInterval(60_000)` in the same Bun event loop — non-blocking alongside the CLI and Telegram bot.

### Tick Cycle

```
tick()
  → if (this.running) return     // overlap guard
  → this.running = true
  → db.getDueTasks()             // WHERE status='pending' AND scheduled_at <= NOW()
  → for each task:
      → db.updateTask(id, { status: "running" })
      → agent.run(task.description, "task")
      → db.updateTask(id, { status: "completed", result, last_run_at })
      → if task.recurrence:
          → calculateNextRun(pattern)
          → db.createTask({ ...same, scheduled_at: next })
  → this.running = false
```

### Recurrence Parser

Simple regex-based parser (no cron library):

| Pattern       | Example       | Next Run                       |
| ------------- | ------------- | ------------------------------ |
| `every Nm`    | `every 30m`   | now + 30 minutes               |
| `every Nh`    | `every 2h`    | now + 2 hours                  |
| `daily HH:MM` | `daily 09:00` | next 9:00am (tomorrow if past) |

---

## 6. Telegram Adapter

Uses grammY's `Bot` class with long polling (`bot.start()`) — non-blocking on the event loop.

### MarkdownV2 Escaping

Telegram's MarkdownV2 requires escaping `_ * [ ] ( ) ~ ` > # + - = | { } . ! \` outside of code blocks. The `escapeMarkdownV2()` function uses a regex state machine:

1. Match protected patterns: ` ```code blocks``` `, `` `inline code` ``, `**bold**`, `[links](url)`
2. For plain text between matches: escape all special chars with `\`
3. Inside code blocks: escape only `` ` `` and `\`
4. Inside link URLs: escape only `)` and `\`
5. Convert `**bold**` (markdown) to `*bold*` (Telegram MarkdownV2)

### Proactive Sends

The adapter exposes `send(message)` which calls `bot.api.sendMessage(chatId, ...)`. The chat ID is:

- Read from `TELEGRAM_CHAT_ID` env var, OR
- Captured from the first incoming message (`ctx.chat.id`)

Communication tools (`send_telegram`, `notify`) receive the `send` function via `CommChannels` interface, wired in App.tsx after the adapter starts.

---

## 7. TUI (Ink / React)

### Split Layout

Root `<App>` renders two panels in a flexbox row:

- **Left (70%)** — `ChatPanel` + `InputBar`
- **Right (30%)** — `LogsPanel` (SystemInfo, ToolCalls, Heartbeat sections)

Terminal height is read from `useStdout().stdout.rows` and set as explicit `height={rows}` on the root box (Ink doesn't support `height: 100%`).

### Viewport Calculation

`ChatPanel` can't rely on Ink's overflow — it clips labels. Instead, it manually calculates which messages fit:

```ts
// Walk backwards from newest, accumulate line counts
for (let i = messages.length - 1; i >= 0; i--) {
	const lines = estimateLines(messages[i], availableWidth);
	if (usedLines + lines > availableRows) break;
	startIdx = i;
}
```

Each message's height is estimated: 1 (label) + ceil(text length / content width) per line + 1 (margin).

### Message Variants

`getVariant()` maps `{ role, source }` to display config:

| Source/Role                 | Label             | Color        | Alignment |
| --------------------------- | ----------------- | ------------ | --------- |
| `source: "task"`            | `role [via TASK]` | magenta      | center    |
| `source: "telegram"` + user | TG                | blue         | right     |
| `role: "user"`              | You               | cyan         | right     |
| `role: "system"`            | sys               | yellow (dim) | center    |
| `role: "assistant"`         | Agent             | red          | left      |

### Command Palette

Typing `/` in the `InputBar` shows a filtered list of commands above the input. Implemented as simple state derived from the input value — no separate component state needed:

```ts
const showPalette = value.startsWith("/") && !value.includes(" ");
const filtered = ALL_COMMANDS.filter((c) => c.name.slice(1).includes(filter));
```

---

## 8. Logging & Observability

### Dual Sink

`logger.push(category, message)` writes to:

1. **In-memory EventEmitter** — consumed by `useLogger` React hook for TUI right panel
2. **`logs/agent.log` file** — `appendFile()` fire-and-forget

`chatBus.push(event)` writes to:

1. **EventEmitter** — consumed by `useStreamAgent` hook for chat panel
2. **`logs/agent.log` file** — same file, different format prefix `[CHAT]`

### Console Override

`console.log/error/warn` are overridden in `index.tsx` to route through `logger.push("system", ...)`. This captures any stray output from third-party libraries (AI SDK debug output, etc.) without corrupting the Ink layout.

### Tool Usage Table

Every tool call is tracked in `tool_usage`:

```
id | message_id (FK) | namespace | name | input (JSON) | result | output (JSON) | error | duration_ms | created_at
```

This enables queries like:

- "Which tools fail most?" — `SELECT namespace, name, COUNT(*) FROM tool_usage WHERE result='failure' GROUP BY 1,2`
- "What did the agent do for this message?" — `SELECT * FROM tool_usage WHERE message_id = ?`
- "Average tool latency?" — `SELECT namespace, name, AVG(duration_ms) FROM tool_usage GROUP BY 1,2`

---

## 9. Self-Modification

The `instructions/` directory contains markdown files that are read into the system prompt on every call. The agent has tools to:

- `read_instructions` — read any instruction file
- `update_instructions` — write/overwrite an instruction file
- `list_skills` — list all files in the directory

When the user says "always respond in bullet points," the agent calls `update_instructions` to edit `communication-style.md`. The change takes effect on the very next LLM call because `buildSystemPrompt()` reads the files fresh every time.

The `instructions` DB table tracks metadata (filename, description, updated_at) but the actual content lives on disk — this makes it easy to version control, manually edit, or inspect outside the agent.

---

## 10. Notion Integration

Seven tools wrapping `@notionhq/client` v5:

- `search` — workspace-wide search by title
- `get_page` / `create_page` / `update_page` — CRUD on pages
- `query_database` — query via `dataSources.query()` (v5 API renamed databases to data sources)
- `append_blocks` — add paragraph content to pages
- `get_block_children` — read page content

All tools are disabled (return empty object) if `NOTION_API_TOKEN` is not set — the agent just doesn't see them. Uses a Notion internal integration token (no OAuth needed).

The `create_page` tool supports a `markdown` field which Notion's API converts to blocks server-side — no client-side block construction needed.

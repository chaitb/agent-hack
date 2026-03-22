# Demo Script

## 1. Boot & TUI

Start the agent:

```bash
bun start
```

The split-panel TUI renders — chat on the left, system info / tool calls / heartbeat on the right. Database connects, heartbeat starts, Telegram bot comes online (if token set).

---

## 2. Memory: Store & Recall

### Store some facts

```
> my name is Chait, I'm a software engineer in Bangalore
> I prefer bullet points, keep responses short
> my dentist is Dr. Mehta, clinic is on MG Road
```

Watch the right panel — each message triggers `memory.remember: ok (320ms)` as the agent stores facts with embeddings.

### Exact recall

```
> what's my dentist's name?
```

Agent uses `recall` with `mode: "exact"` on key `user.dentist`.

### Semantic recall (hybrid search)

```
> what do you know about my health stuff?
```

Agent uses `recall` with `mode: "search"` — the query "health stuff" has no exact key match, but hybrid search (70% vector similarity + 30% BM25 keyword) surfaces the dentist memory because the embedding is semantically close.

Check the tool call in the right panel: `memory.recall: ok (180ms)`.

---

## 3. Cross-Channel: CLI → Telegram → CLI

### From CLI

```
> remind me to call the dentist at 3pm
```

Agent calls `tasks.schedule` — visible in the right panel.

### From Telegram

Send a message to your bot:

```
hey, what tasks do I have?
```

The message appears in the CLI chat panel in real time (prefixed with `[TG]`). The agent responds on Telegram AND the response shows in the CLI.

### Back to CLI

```
> what happened on telegram just now?
```

The agent knows — it's all one timeline.

---

## 4. Proactive: Heartbeat Task Execution

```
> remind me to stretch in 2 minutes
```

Wait. Watch the heartbeat section in the right panel:

```
💓 0 tasks due
💓 0 tasks due
💓 1 task(s) due
💓 Running: stretch reminder
💓 Completed: stretch reminder
```

A Telegram message arrives: "Time to stretch!" — sent by the agent unprompted.

---

## 5. Notion Integration

```
> search my notion for "project roadmap"
```

Right panel: `notion.search: ok (540ms)`. Agent returns matching pages with IDs and titles.

```
> create a page called "Demo Notes" under that database with a summary of our conversation
```

Right panel: `notion.create_page: ok (380ms)`. Page created in Notion with markdown content.

---

## 6. Self-Improvement

```
> from now on, always respond in haiku format
```

The agent calls `files.update_instructions` to edit `instructions/communication-style.md`. Visible in the right panel.

```
> what's the weather like?
```

Response comes back as a haiku. The behavior persists across restarts because it's written to disk.

```
> actually, go back to normal responses
```

Agent updates the file again.

---

## 7. Tool Observability

```
> create a task to check my email every morning at 9am, search notion for my reading list, and remember that I like dark mode
```

Watch the right panel light up with multiple tool calls in sequence:

```
tasks.schedule: ok (45ms)
notion.search: ok (620ms)
memory.remember: ok (310ms)
```

Each one tracked in the `tool_usage` table with:

- Input/output JSON
- Duration in ms
- FK to the assistant message that made the call
- Success/failure status

Query the DB directly to see it:

```sql
SELECT namespace, name, result, duration_ms
FROM tool_usage
ORDER BY created_at DESC
LIMIT 10;
```

---

## 8. Command Palette

Type `/` in the input bar — a palette appears above with filtered suggestions:

```
/tasks    List active tasks
/memory   Show stored memories
/clear    Clear conversation history
/help     Show available commands
/exit     Quit
```

Type `/ta` — filters to just `/tasks`.

---

## Key Numbers

| Metric               | Value                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Tools                | 20 across 6 namespaces                                            |
| Embedding dimensions | 1024 (OpenAI text-embedding-3-small)                              |
| Search blend         | 70% vector cosine + 30% BM25                                      |
| Heartbeat interval   | 60 seconds                                                        |
| Memory token budget  | 2000 tokens (~8000 chars)                                         |
| DB tables            | 6 (messages, memory, memory_fts, tasks, tool_usage, instructions) |
| Channels             | 3 (CLI, Telegram, Email stub)                                     |

# SPEC: Proactive CLI Agent with Persistent Memory

## Vision

A single, long-lived AI agent that acts as a proactive personal assistant. Inspired by [OpenClaw](https://openclaw.ai/) — an autonomous agent that lives on messaging platforms and acts on your behalf — but built from scratch as a Bun/TypeScript CLI-first agent with a unified session model.

Unlike typical chatbot agents that have isolated conversation threads, this agent has **one continuous identity and memory**. Whether I interact with it through the CLI, telegram, or email, it's the same session, the same context, the same agent. It remembers everything, wakes up on its own, and reaches out to me when it needs to.

---

## Core Principles

1. **Single Thread** — There are no "conversations." There is one agent, one memory, one ongoing relationship. Every interaction (CLI, telegram, email) appends to the same unified timeline.

2. **Proactive, Not Reactive** — The agent doesn't just wait for input. It has a heartbeat. It wakes up, checks its task queue, evaluates conditions, and acts. It can message me first.

3. **Self-Improving** — The agent can read and write its own instructions and skills. It learns what I care about and adapts its behavior over time by editing files in its own instructions directory.

4. **Context on the Fly** — With a single long-lived session, the raw message history will grow unbounded. The agent must build the most relevant context window dynamically for every interaction — pulling from recent messages, stored memories, active tasks, and its own instructions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Interfaces                     │
│   CLI (readline)  │  telegram  │  Email (SMTP)   │
└────────┬──────────┴─────┬──────┴────────┬────────┘
         │                │               │
         ▼                ▼               ▼
┌─────────────────────────────────────────────────┐
│              Unified Message Router               │
│  (normalizes input → appends to timeline →        │
│   triggers agent)                                 │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│              Agent Core (ToolLoopAgent)           │
│  model: claude-sonnet-4-20250514                  │
│  tools: [see Tools section]                       │
│  stopWhen: [stepCountIs(25), hasToolCall('done')] │
│  prepareStep: [context builder]                   │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│              Persistent Layer (Turso/LibSQL)      │
│  messages │ memory │ tasks │ instructions         │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│              Heartbeat (setInterval 60s)          │
│  polls tasks table → evaluates conditions →       │
│  triggers agent or sends notifications            │
└─────────────────────────────────────────────────┘
```

---

## Database Schema (Turso/LibSQL)

### `messages`

The unified timeline. Every interaction from every interface lands here.

| Column     | Type     | Description                                     |
| ---------- | -------- | ----------------------------------------------- |
| id         | TEXT PK  | UUID                                            |
| role       | TEXT     | `user`, `assistant`, `system`, `tool`           |
| content    | TEXT     | Message content (text or JSON for tool calls)   |
| source     | TEXT     | `cli`, `telegram`, `email`, `heartbeat`, `task` |
| metadata   | TEXT     | JSON blob — tool call IDs, attachments, etc.    |
| created_at | DATETIME | Timestamp                                       |

### `memory`

Long-term key-value knowledge the agent accumulates over time. Things like "user prefers morning summaries" or "user's timezone is IST."

| Column     | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| id         | TEXT PK  | UUID                                     |
| key        | TEXT UQ  | Semantic key (e.g. `user.timezone`)      |
| value      | TEXT     | The stored value                         |
| category   | TEXT     | `preference`, `fact`, `skill`, `context` |
| updated_at | DATETIME | Last update timestamp                    |

### `tasks`

The task queue. Scheduled, recurring, or one-off tasks the agent needs to act on.

| Column       | Type     | Description                                              |
| ------------ | -------- | -------------------------------------------------------- |
| id           | TEXT PK  | UUID                                                     |
| title        | TEXT     | Human-readable task name                                 |
| description  | TEXT     | What needs to be done (can be a full prompt)             |
| status       | TEXT     | `pending`, `running`, `completed`, `failed`, `cancelled` |
| priority     | INTEGER  | 0 (low) to 10 (critical)                                 |
| scheduled_at | DATETIME | When to execute (null = ASAP)                            |
| recurrence   | TEXT     | Cron-like pattern or null (e.g. `*/60 * * * *`)          |
| last_run_at  | DATETIME | Last execution time                                      |
| result       | TEXT     | Output/result from last execution                        |
| created_at   | DATETIME | When the task was created                                |
| updated_at   | DATETIME | Last update                                              |

### `instructions`

Metadata index of the agent's instruction files. The actual content lives on disk in `./instructions/`, but this table tracks what exists and when it was last modified.

| Column      | Type     | Description                               |
| ----------- | -------- | ----------------------------------------- |
| id          | TEXT PK  | UUID                                      |
| filename    | TEXT UQ  | e.g. `system-prompt.md`, `email-style.md` |
| description | TEXT     | What this instruction file is for         |
| updated_at  | DATETIME | Last modification time                    |

---

## The Agent (ToolLoopAgent)

The core agent uses Vercel AI SDK's `ToolLoopAgent` class. One instance, configured once, invoked on every interaction.

### Key SDK Functions

- **`ToolLoopAgent`** — constructor. Holds model, tools, system prompt, stop conditions.
- **`agent.generate()`** — run the full tool loop synchronously, returns final text + all steps.
- **`agent.stream()`** — same but streaming. Use for CLI output.
- **`tool()`** helper — define each tool with `description`, `inputSchema` (zod), and `execute`.
- **`stopWhen`** — array of conditions: `stepCountIs(25)`, `hasToolCall('done')`.
- **`prepareStep`** — runs before each LLM call. This is where we build dynamic context.

### `prepareStep` — The Context Builder

This is the most critical function. Before every LLM step, it:

1. Fetches the **last N messages** from the unified timeline (recency)
2. Fetches all **active memories** relevant to the current input (semantic lookup)
3. Fetches **active/pending tasks** so the agent knows what's on its plate
4. Reads the agent's **instruction files** from `./instructions/`
5. Assembles all of this into the `messages` array that gets sent to the model

This replaces the idea of "conversation history" with **dynamic context assembly**. The agent never sends the full timeline — it builds the best possible context window every single time.

The `prepareStep` callback returns `{ messages, instructions }` to override what gets sent to the model at each step.

### Stop Conditions

The loop ends when:

- The agent calls the `done` tool (explicit completion signal)
- 25 steps are reached (safety limit)
- No more tool calls are generated (natural completion)

---

## Tools

### Memory Tools

| Tool       | Description                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `remember` | Save a key-value pair to the `memory` table. The agent calls this when it learns something worth persisting. |
| `recall`   | Query the memory table by key or category. Used during context building and explicitly by the agent.         |
| `forget`   | Delete a memory entry. For correcting outdated information.                                                  |

### Task Tools

| Tool            | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| `schedule_task` | Create a new task in the queue. Accepts title, description, scheduled_at, recurrence. |
| `list_tasks`    | Query tasks by status, priority, or time range.                                       |
| `update_task`   | Modify a task's status, description, or schedule.                                     |
| `cancel_task`   | Mark a task as cancelled.                                                             |

### Communication Tools

| Tool            | Description                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `send_telegram` | Send a telegram message to the user. Uses the telegram Business API or a bridge like Twilio. The agent uses this to proactively reach out. |
| `send_email`    | Send an email via SMTP/Resend/SES. For longer-form communication, summaries, reports.                                                      |
| `notify`        | A lightweight notification — chooses the best channel based on urgency and user preferences stored in memory.                              |

### File Tools

| Tool         | Description                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `read_file`  | Read any file from the project directory. Used for reading instructions, data files, etc.                   |
| `write_file` | Write/overwrite a file. The agent can update its own instructions, create new skill files, or save reports. |
| `list_files` | List files in a directory. Used to discover what instructions/skills exist.                                 |

### Self-Modification Tools

| Tool                  | Description                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_instructions`   | Read a specific instruction file from `./instructions/`. Convenience wrapper over `read_file`.                                                               |
| `update_instructions` | Write to an instruction file. This is how the agent evolves — it can refine its own system prompt, add new skills, or adjust its behavior based on feedback. |
| `list_skills`         | List all instruction/skill files the agent has access to.                                                                                                    |

### Utility Tools

| Tool               | Description                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_current_time` | Returns current date/time and timezone. The agent has no innate sense of time.                                                               |
| `done`             | Signal task completion. Has no `execute` function — calling it stops the agent loop. Used with `toolChoice: 'required'` pattern when needed. |

---

## The Heartbeat

A `setInterval` loop running every **60 seconds** in the same Bun process. This is not AI — it's a simple poller.

### Heartbeat Cycle

Every 60 seconds:

1. **Query tasks** — `SELECT * FROM tasks WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY priority DESC`
2. **For each due task:**
    - If the task is simple and deterministic (e.g., "send daily summary email"), execute it directly without invoking the LLM.
    - If the task requires reasoning (e.g., "check if any emails need follow-up"), invoke the agent with the task description as input, source = `task`.
3. **Check recurring tasks** — If a completed task has a `recurrence` pattern, calculate the next `scheduled_at` and reset status to `pending`.
4. **Condition checks** — Evaluate any registered conditions (these could be stored as tasks with a special type) and trigger notifications if met.

### What the Heartbeat Does NOT Do

- It does not run the full LLM on every tick. Most ticks will result in "nothing to do."
- It does not manage its own state. Everything is in the database.
- It does not block the CLI. It runs on a separate async interval in the same event loop.

---

## The Instructions Directory

```
./instructions/
├── system-prompt.md        # The agent's core identity and behavior rules
├── communication-style.md  # How to write messages (tone, length, format)
├── user-profile.md         # What the agent knows about the user (auto-updated)
├── daily-routine.md        # User's schedule, preferences for when to be contacted
└── skills/
    ├── email-summary.md    # How to summarize emails
    ├── task-planning.md    # How to break down tasks
    └── ...                 # Agent can create new skills over time
```

The agent reads these files during `prepareStep` to build its system prompt. It can also **write to them** — if I say "from now on, always respond in bullet points," the agent should update `communication-style.md` itself.

This is the self-improving loop: user feedback → agent updates instructions → future interactions use updated instructions.

---

## Unified Session Model

### How It Works

There is no concept of "starting a new conversation." The agent has one timeline:

```
[CLI] 10:00am  — User: "remind me to call the dentist at 3pm"
[CLI] 10:00am  — Agent: "Done. I'll ping you at 3pm."
[TASK] 3:00pm  — Heartbeat triggers task → Agent sends telegram: "Time to call the dentist!"
[WA]  3:05pm   — User: "thanks, done"
[WA]  3:05pm   — Agent: "Great, marking it complete."
[CLI] 6:00pm   — User: "what did I do today?"
[CLI] 6:00pm   — Agent: "You called the dentist at 3pm. Other than that..."
```

All of this is one session. The agent knows the telegram message at 3:05pm is a response to the reminder it sent. The CLI message at 6pm can reference everything that happened across all channels.

### Context Building Strategy

Since we can't send the entire timeline to the LLM, `prepareStep` builds context using:

1. **Recent window** — Last ~20 messages regardless of source
2. **Active task context** — If the current interaction relates to a task, include that task's history
3. **Memory injection** — All stored memories (these should be kept concise)
4. **Instructions** — The full system prompt assembled from `./instructions/`
5. **Source awareness** — The agent knows which channel the current message came from and adapts its response length/format accordingly (telegram = short, email = detailed, CLI = medium)

---

## Interface Adapters

Each interface is a thin adapter that:

1. Receives input from its channel
2. Normalizes it into a `{ role, content, source }` message
3. Appends it to the `messages` table
4. Invokes `agent.generate()` or `agent.stream()`
5. Sends the response back through its channel

### CLI Adapter

- readline-based REPL
- Streams responses using `agent.stream()`
- Supports slash commands for direct memory/task manipulation

### telegram Adapter

- Webhook receiver (Express/Hono server)
- Receives messages via Twilio/telegram Business API
- Sends responses back via API
- Short-form responses

### Email Adapter

- Polls inbox via IMAP or receives via webhook (SendGrid/Resend inbound)
- Sends via SMTP/API
- Long-form responses, can include formatting

---

## What This Is NOT

- **Not a multi-agent system** — One agent, one brain. No delegation to sub-agents.
- **Not a RAG pipeline** — Memory is explicit key-value pairs, not vector search over documents. If we need RAG later, it's a tool, not the architecture.
- **Not stateless** — The agent accumulates state over days, weeks, months. It's designed to be long-lived.
- **Not a framework** — This is a specific product, built for one user (me), with opinionated choices.

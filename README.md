# CLI Agent with Persistent Memory

A Bun-based CLI agent using Vercel's AI SDK (Anthropic) with persistent memory via Turso/LibSQL.

## Features

- 🤖 CLI-based agent loop
- 💾 Persistent memory using Turso (LibSQL)
- 🔌 Powered by Anthropic API
- ⚡ Built with Bun & TypeScript
- 🎯 Context-aware conversations

## Setup

### Prerequisites

- Bun (https://bun.sh)
- Anthropic API key
- Turso database setup (https://turso.tech)

### Installation

1. Install dependencies:
```bash
bun install
```

2. Set up your `.env` file with credentials:
```
ANTHROPIC_API_KEY=your_anthropic_api_key
TURSO_CONNECTION_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
```

### Running

Development mode with hot reload:
```bash
bun run dev
```

Start the agent:
```bash
bun start
```

## Commands

In the CLI:

- `your message` - Chat with the agent
- `/memory <key> <value>` - Save something to persistent memory
- `/recall <key>` - Recall something from memory
- `/clear` - Clear conversation history
- `/exit` - Exit the program

## Architecture

### `src/memory.ts`
Handles persistent storage with LibSQL/Turso. Manages:
- Conversation messages
- Key-value memory storage

### `src/agent.ts`
Core agent logic using Vercel's AI SDK:
- `think()` - Generate response using Claude
- `stream()` - Stream responses
- Memory management methods

### `src/index.ts`
CLI interface with readline-based REPL loop

## Project Structure

```
agent-hack/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── agent.ts      # Agent logic
│   └── memory.ts     # Persistent memory
├── .env              # Environment variables (not in git)
├── .env.example      # Environment variables template
├── tsconfig.json     # TypeScript configuration
└── package.json      # Dependencies
```

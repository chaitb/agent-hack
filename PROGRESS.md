# Refactor Progress

## Web Query Refactor
- [x] Document TanStack Query, file-size, persistence-query, and shared-type rules in `AGENTS.md`.
- [x] Add TanStack Query provider to the web client.
- [x] Move shared web-facing types into `src/core/model/` and re-export them.
- [x] Create object-specific persistence query modules under `src/persistence/queries/`.
- [x] Refactor web routes to use TanStack Query for API reads.
- [x] Enforce one `useQuery` call per file across the web interface.
- [x] Enforce maximum two React components per file across touched web files.
- [x] Split web UI files into grouped component folders where needed.

## Verification
- [x] Run `bunx tsc --noEmit`.
- [x] Run `bun test`.
- [x] Run `bun run build:web`.

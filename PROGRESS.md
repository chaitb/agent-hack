# Refactor Progress

## Shared runtime and structure
- [x] Finish import cleanup after the `core` / `persistence` / `runtime` / `interfaces` split.
- [x] Keep TUI boot wired through `createAppRuntime()` and remove any remaining direct runtime setup from interface code.
- [ ] Confirm CLI database commands still work from `src/interfaces/cli.ts` against a live Turso connection.

## Web server and chat route
- [x] Finalize the Bun server entrypoint for `GET /chat`.
- [x] Finalize the SSE transport for `POST /api/chat`.
- [ ] Verify web-originated messages persist with `source = "web"` against a live runtime.

## Zen Tailwind system
- [x] Finish migrating the Zen palette, typography, cards, and bubble styles into Tailwind CSS.
- [x] Replace any leftover Bun template/demo UI artifacts.
- [x] Verify the `/chat` page works on desktop and mobile layouts.

## Verification
- [x] Run automated tests.
- [x] Run the web build and TUI build.
- [ ] Smoke-test the TUI and web entrypoints after the refactor on a machine with Turso connectivity.

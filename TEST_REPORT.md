# Znith Desktop MVP Phase 1+2 — Verification Report

Date: 2026-11-04

## Executed successfully in the delivery environment

1. `node scripts/check-offline.mjs` — parses all TypeScript/TSX source files with TypeScript compiler parser, parses JSON manifests, confirms exactly 12 node definitions, and evaluates a transpiled `mockNode` function to verify story, script, and a 5-shot storyboard.
2. `python3 scripts/check-sqlite-schema.py` — executes the actual embedded SQLite migration SQL in an in-memory SQLite database, checks expected tables, schema version and foreign-key enforcement.
3. `git log --oneline` — verifies independent commits for workspace, database/validator, scheduler, Electron integration, renderer UI, tests/docs and fixes.

## Not executable in this environment

- `pnpm install`: npm registry DNS resolution fails (`EAI_AGAIN registry.npmjs.org`). pnpm is not preinstalled and the package cache is empty.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm dev`, Electron GUI startup, and `electron-builder`: require dependency installation, Electron/native better-sqlite3 bindings and a desktop runtime. **Not claimed as passed.**
- End-to-end native installer tests on Windows/macOS/Linux: not performed.

## What to verify on a connected desktop

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
pnpm package:dir
```

After a successful dependency install, commit the generated `pnpm-lock.yaml` to the repository. The current ZIP intentionally excludes a lockfile because package resolution could not be performed offline.

## Scope disclaimer

The project provides Phase 1+2 mock workflow execution. The registered Image/Video/Audio/Export nodes produce **JSON mock placeholders**, not real media. Ollama, ComfyUI, shuohao-skills and reelbench-skills integrations are planned for subsequent phases and not bundled or claimed functional here.

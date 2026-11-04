# Znith AI Visual Workflow Studio — Verification report

Date: 2026-11-04

## Passed locally with pnpm 10.18.2

- `pnpm install --frozen-lockfile` — dependency install and native builds succeeded.
- `pnpm typecheck` — renderer, Electron main/preload, and shared packages typecheck successfully.
- `pnpm test` — 14 tests pass, including workflow create/list/rename/duplicate/delete and last-workflow protection.
- `pnpm build` — Vite renderer and Electron main/preload bundles build successfully.
- `python3 scripts/check-sqlite-schema.py` — SQLite bootstrap creates the expected tables and enforces foreign keys.
- `node scripts/check-offline.mjs` — parses TypeScript/TSX and JSON, verifies the 12-node registry and mock story/script/storyboard outputs.

## GitHub Actions

- Run #78 exposed that pnpm 10.18.2 ignored the newer `allowBuilds` setting, leaving `better-sqlite3` without native bindings.
- Replaced it with the pnpm 10 compatible `onlyBuiltDependencies` allowlist for `better-sqlite3`, Electron, and esbuild.
- Run #79 passed on the implementation branch, including install, typecheck, tests, and build: https://github.com/Zenithh-Studio/zenith-app/actions/runs/41792529183

## Not verified

- Electron GUI interaction and native installers were not launched in this environment.
- Live Ollama, ComfyUI, Piper, FFmpeg, and cloud provider execution require separately installed services, models, credentials, or binaries.
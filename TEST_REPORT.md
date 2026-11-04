# Znith AI Visual Workflow Studio — Local verification

Date: 2026-11-04

## Passed

- `pnpm install --frozen-lockfile` — workspace dependencies match the committed lockfile.
- `pnpm typecheck` — renderer, Electron main/preload, and shared packages typecheck successfully.
- `pnpm test` — 14 tests pass, including workflow create/list/rename/duplicate/delete and last-workflow protection.
- `pnpm build` — Vite renderer and Electron main/preload bundles build successfully.
- `python3 scripts/check-sqlite-schema.py` — SQLite bootstrap creates the expected tables and enforces foreign keys.
- `node scripts/check-offline.mjs` — parses TypeScript/TSX and JSON, verifies the 12-node registry and mock story/script/storyboard outputs.

## Not verified locally

- Electron GUI interaction and native installers were not launched in this environment.
- Live Ollama, ComfyUI, Piper, FFmpeg, and cloud provider execution require separately installed services, models, credentials, or binaries.
- CI will run after the implementation branch is pushed; no CI result is claimed before then.
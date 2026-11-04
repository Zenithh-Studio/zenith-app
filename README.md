# Znith Desktop — MVP Phase 1+2

**Local-first AI Filmmaking Node Canvas** built with Electron, React, Vite, React Flow, SQLite, Drizzle ORM and a persistent local DAG scheduler. Runs **offline mock nodes** for Story → Script → Storyboard; no Docker, PostgreSQL, Redis, MinIO, Ollama, ComfyUI, cloud key or account needed for this phase.

> **Scope:** This is a working-source MVP scaffold, **not** a production-ready installer or real video generator. AI models, approval actions, batch fan-out, video/audio generation, signed installers and cloud providers are **not** implemented. Media node mock outputs are JSON placeholders, **not actual image/video files**.

## Prerequisites

- Node.js **22 LTS** (Electron native build support required)
- pnpm **10.18.2**: `corepack enable && corepack prepare pnpm@10.18.2 --activate`
- Git
- Desktop session with Electron's OS libraries (Linux users need system GTK/NSS/X11 or Wayland dependencies)
- Network access to install npm dependencies (installer/download Electron and native sqlite modules)

## Quick start

```bash
pnpm install
pnpm dev
```

The app creates its own SQLite database, **no server needed**. On first launch it creates **First Film** with three connected nodes, all using deterministic mock executors. Hit **Run Mock**, select a node, and click **View ... JSON** to inspect its saved artifact. Click **Save** after editing the canvas.

### Build and test

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
```

`package:dir` assembles an unpacked executable app in `apps/desktop/release/` for the current OS. This project has not yet been tested as an installer on Windows/macOS/Linux in this environment; verify packaging on each target platform. `pnpm package:win` and `pnpm package:linux` target those platforms from a compatible build machine. For pnpm 10, `pnpm-workspace.yaml` configures native dependency build approval via `onlyBuiltDependencies`.

Optional structural checks without installing npm dependencies (requires TypeScript globally installed):

```bash
npm install -g typescript  # only if needed
node scripts/check-offline.mjs
```

## How it works

1. A default project gets saved in `Documents/Znith Projects/First-Film-*`.
2. `znith.sqlite` is stored in Electron's OS-specific `userData` directory.
3. Graph state and immutable execution snapshots live in SQLite.
4. `LocalScheduler` finds READY nodes from dependencies, marks them RUNNING atomically and emits status events via IPC.
5. Mock executors create text JSON artifacts under `<project>/artifacts/<run-id>/<node-id>/`.
6. Crash recovery resets unfinished RUNNING mock jobs to READY, allowing replay; no paid work is submitted.

### Design constraints

- Save allows an incomplete graph draft. Run always validates types, required inputs, config and cycles.
- The script node accepts **story OR outline** for the 3-node demonstration; full film graph may use the outline port.
- Node ports are typed; the Canvas has 12 registered definitions.
- The Approval Gate is a registered node that pauses in `WAITING_APPROVAL`; the decision UI is Phase 3.
- Batch/media/export nodes produce mock JSON outputs only in this phase; they do not yet fan out shot renders.
- A cloud runtime node is deliberately rejected at execution; it never silently uploads data.
- Project artifact paths are relative, not absolute, and read through a restricted IPC handler.
- SQLite uses WAL + foreign keys. v0.2 bootstraps schema version 1; future schema changes require versioned migrations.

## Repository layout

```text
apps/desktop/                  Electron main/preload, Vite/React Flow renderer, tests
packages/contracts/            Shared Zod schemas, node/artifact/run contracts
packages/node-registry/        12 typed node definitions, three-node default graph
packages/workflow-engine/      Graph validation + dependency utilities
packages/database/             SQLite/Drizzle repositories and schema
packages/local-runner/         Persistent local DAG scheduler, mock executors
scripts/check-offline.mjs      Dependency-free structural/smoke checks
scripts/publish-github.sh      Creates a private GitHub repository, preserving commits
```

## Local project storage

- Windows: Electron's `%APPDATA%/znith-desktop`-style userData path (actual path depends on app metadata) for SQLite; Windows Documents for project media.
- macOS: `~/Library/Application Support/...` for SQLite and `~/Documents/Znith Projects/` for projects.
- Linux: `~/.config/...` for SQLite and `~/Documents/Znith Projects/` for projects.

## Git history and publication

The source ZIP **includes `.git`** with Conventional Commits by module, not one giant commit. The GitHub connector available in this chat cannot create a new GitHub repository. To create and push it from your own computer, after installing/authenticating [GitHub CLI](https://cli.github.com/):

```bash
bash scripts/publish-github.sh d0hx4n2503/znith-desktop
```

This creates a **private** repository and pushes the existing history, subject to your GitHub permissions and repo name availability. No force push or overwrite is attempted.

## Roadmap to Phase 3

1. Ollama provider + structured screenplay/shot-list outputs.
2. Pin and integrate `shuohao-skills` (outline, script, characters, storyboard), including their own validators.
3. Approval decision UI and resumable paused runs.
4. ComfyUI image/video providers, actual per-shot fan-out and FFmpeg MP4 export.
5. `reelbench-skills` for analysis and export metadata tools after basic video export works.

### Security note

The Phase 1+2 renderer CSP permits inline scripts to support the Vite React development preamble. Before distribution, tighten the packaged CSP (remove `unsafe-inline`), implement strict navigation/resource policy, and perform a security review. Electron keeps context isolation enabled, sandbox enabled and Node integration disabled.

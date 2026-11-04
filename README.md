# Znith AI Visual Workflow Studio

Znith is a local-first desktop studio for building and running AI filmmaking workflows. It combines Electron, React, Vite, React Flow, SQLite, Drizzle, and a persistent local DAG scheduler. The workflow editor supports typed nodes, ports, validation, execution status, approvals, artifacts, and local media generation adapters.

## Workflow management

The `/workflows` screen is the starting point. It lists workflows across projects with search, run-status filters, sorting, and pagination. From the table you can open, create, run or restart, rename, duplicate, and delete workflows. Each workflow opens at `/workflows/:workflowId/editor`.

The editor provides a pannable and zoomable canvas, node library, typed connections, node configuration inspector, execution history, approval actions, retry/cancel controls, and artifact previews. Graph drafts may be saved before they are runnable; execution validates required ports, types, and cycles.

## Local development

Requirements: Node.js 22 or newer, pnpm 10.18.2, and a desktop session for running Electron.

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install
pnpm dev
```

The app creates a local SQLite database and a project directory under the operating system's Documents folder. The demo workflow uses deterministic mock outputs and does not require an AI service.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
```

CI runs typecheck, tests, and the production build on pushes and pull requests. The committed lockfile is used for reproducible installs.

## Runtime options

- **Text generation:** Mock by default, with Ollama local inference and an optional OpenAI-compatible cloud LLM adapter configured in the Electron main-process environment.
- **Image and video:** Mock by default or ComfyUI API-format workflows on a local ComfyUI endpoint.
- **Narration:** Mock audio or local Piper TTS with a configured voice model.
- **Film export:** Mock output or FFmpeg MP4 export from generated clips and optional narration.
- **Skills and analysis:** The repository includes adapters for the film skill flow and Reelbench analysis planning. It does not execute upstream skill shell scripts.

Cloud execution is explicit per node. Local services are restricted to loopback addresses; secrets are kept outside workflow graphs. Providers, model weights, and external binaries are not bundled with the desktop app.

## Architecture

- `apps/desktop/` — Electron main/preload, React renderer, React Flow editor, and UI tests.
- `packages/contracts/` — shared graph, artifact, run, and IPC types.
- `packages/database/` — SQLite schema, workflow/project persistence, and run history.
- `packages/workflow-engine/` — graph validation and dependency handling.
- `packages/local-runner/` — persistent local scheduler and node execution.
- `packages/node-registry/` — typed filmmaking nodes and starter graph.
- `packages/providers/`, `packages/media-engine/`, `packages/skill-runtime/` — provider and media adapters.

## Current limits

This is a working desktop application, but target OS installers and real AI models/services must be verified on the machines where they will run. The app does not install model weights, ComfyUI custom nodes, Piper voices, or FFmpeg. Upstream `shuohao-skills` scripts and quality gates are not executed; Reelbench support is an adapter rather than a full analysis pipeline.
# Znith AI Visual Workflow Studio

Znith is a local-first desktop studio for building and running AI workflows. It combines Electron, React, Vite, React Flow, SQLite, Drizzle, and a persistent local DAG scheduler. The editor supports typed nodes, ports, graph validation, execution status, approvals, artifacts, and local media generation adapters.

## Workflow management

The `/workflows` screen is the starting point. It lists workflows across projects with search, run-status filters, sorting, and pagination. From the table you can open, create, run or restart, rename, duplicate, and delete workflows. New workflows open on an empty canvas so users build their own graphs instead of running seeded sample data.

The editor provides a pannable and zoomable canvas, node library, typed connections, node configuration inspector, execution history, approval actions, retry/cancel controls, and artifact previews. Graph drafts may be saved before they are runnable; execution validates required ports, types, and cycles.

## Local development

Requirements: Node.js 22 or newer, pnpm 10.18.2, and a desktop session for running Electron.

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install
pnpm dev
```

The app creates a local SQLite database and a project directory under the operating system's Documents folder. Add a Text Prompt node, then connect it to an AI action such as Outline Agent or Script Agent. Configure the model in the node inspector before running. The node toolbar runs the selected node and its upstream inputs; the green header button runs the full graph.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
```

CI runs typecheck, tests, and the production build on pushes and pull requests. The committed lockfile is used for reproducible installs.

## Runtime options

- **Text generation:** Ollama local inference by default, with an optional OpenAI-compatible cloud LLM adapter configured in the Electron main-process environment. Mock sample output is an explicit option.
- **Image and video:** ComfyUI API-format workflows on a local ComfyUI endpoint by default. Mock mode can be selected for sample metadata.
- **Narration:** Local Piper TTS by default with a configured voice model. Mock mode can be selected for sample metadata.
- **Film export:** FFmpeg MP4 export by default from generated clips and optional narration. Mock mode can be selected for sample metadata.
- **Skills and analysis:** The repository includes adapters for the film skill flow and Reelbench analysis planning. It does not execute upstream skill shell scripts.

Cloud execution is explicit per node. Local services are restricted to loopback addresses; secrets are kept outside workflow graphs. Providers, model weights, and external binaries are not bundled with the desktop app.

## Architecture

- `apps/desktop/` — Electron main/preload, React renderer, React Flow editor, and UI tests.
- `packages/contracts/` — shared graph, artifact, run, and IPC types.
- `packages/database/` — SQLite schema, workflow/project persistence, and run history.
- `packages/workflow-engine/` — graph validation and dependency handling.
- `packages/local-runner/` — persistent local scheduler and node execution.
- `packages/node-registry/` — typed AI and media action nodes.
- `packages/providers/`, `packages/media-engine/`, `packages/skill-runtime/` — provider and media adapters.

## Current limits

Real inference requires the user to install the provider service and model: Ollama for text nodes, ComfyUI plus an exported API workflow for image/video nodes, and Piper plus a voice model for narration. FFmpeg is required for MP4 export. These services and model weights are not bundled with Znith. Upstream `shuohao-skills` scripts and quality gates are not executed; Reelbench support is an adapter rather than a full analysis pipeline.

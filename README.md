# Znith AI Visual Workflow Studio

Znith Studio is a Next.js, Payload, and XYFlow application for building and executing typed visual workflows. Workflow definitions, execution snapshots, node records, logs, and outputs persist in the connected Payload backend.

## Development

The Figma Make development server is managed by the host and already runs on `$PORT`.

```bash
pnpm install
pnpm test
pnpm exec tsc --noEmit
NODE_ENV=production pnpm build
figma make verify-deploy
```

Open `/` for workflow management, `/workflows/:id` for the editor, and `/admin` for Payload administration.

## Provider configuration

The OpenAI adapter reads `APP_OPENAI_API_KEY` only in server code. Configure it in **Make settings → Secrets**. When it is absent, AI nodes fail with a configuration-required error and never return fabricated output.

Media generation nodes are shown as unavailable until a compatible server-side provider adapter is configured.

## Implemented production slice

- Persistent workflow management: create, search, open, duplicate, delete, import, and export
- Infinite XYFlow canvas with pan, zoom, minimap, selection, node movement, typed connections, edge/node deletion, auto-layout, and fit controls
- Undo/redo history, multi-node copy/paste shortcuts, and edge reconnection
- Node palette and right-side inspector with configuration, resolved connection state, output preview, and execution logs
- Versioned node registry independent of the visual components
- DAG validation, cycle rejection, required-input checks, explicit port mapping, bounded parallel scheduling, retry/backoff, timeouts, failure propagation, node/dependency execution, and persistent snapshots
- Real OpenAI text execution through a server-only adapter
- Executable text, prompt, JSON, template, text/JSON merge, JSON transform, variable, guarded HTTP request, delay, debug, and preview nodes
- Provider-ready creative, story, and video templates; unavailable media nodes are explicitly labeled

See [`docs/architecture.md`](docs/architecture.md) and [`docs/node-development.md`](docs/node-development.md).

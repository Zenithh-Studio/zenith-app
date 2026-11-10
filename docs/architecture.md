# Architecture

## Workspace map

- **Studio app (`apps/studio/`)** owns the Next.js App Router, browser-local Studio UI, and stateless provider routes.
- **Studio features (`apps/studio/src/features/`)** contain route views, browser interactions, shared layout, and styles. Durable data access goes through the IndexedDB adapter.
- **Studio server (`apps/studio/src/server/`)** contains request validation, provider execution, and media validation. It does not persist Studio records.
- **Contracts (`packages/contracts/`)** owns workflow DTOs, Zod request schemas, node types, provider catalog, registry, and starter templates.
- **Utilities (`packages/utils/`)** contains pure functions reused across workspace boundaries.

Next.js transpiles the shared packages through `transpilePackages`. The Studio app is packaged as a standalone Next.js server. Docker Compose runs the app and optional provider gateways; it has no Studio database service.

## Data flow

```text
Browser IndexedDB → local Studio adapter → Studio UI
Provider requests → App Router handlers → provider engine
```

The browser's `studio-local-api.ts` implements a fetch-compatible CRUD layer backed by IndexedDB. App Router handlers validate provider requests and return outputs for the browser to save.

## Workflow execution

1. The browser reads a workflow definition from IndexedDB and sends it with a run request.
2. The workflow engine checks node identifiers, edge ports, data types, required inputs, and cycles.
3. Ready nodes run with bounded concurrency, retry, and timeout settings.
4. The route returns execution records and outputs; the browser stores them in IndexedDB.
5. The editor reloads the saved execution and displays node outputs and history.

Snapshots are retained for reproducibility. Binary media is kept in the `assetFiles` IndexedDB store; metadata is kept separately in `media`.

## Persistence

The browser database is named `zenith-studio`. Its stores are `workflows`, `executions`, `prompts`, `textAssets`, `media`, `assetFiles`, `generations`, and `settings`. Data is scoped to the browser profile and site origin and does not automatically sync between devices.

The files in `apps/studio/src/migrations/` are historical PostgreSQL migration records. They are excluded from the active app build and are not run by Docker Compose.

## Security and operations

- Provider credentials are stored in browser IndexedDB and are included only in requests that need a provider; they are not included in workflow exports.
- Anyone with access to the browser profile and site origin can access its local Studio data.
- Docker Compose keeps ChatGPT2API and Muse2API gateway data and generated keys in their own volumes.
- Workflow definitions are versioned JSON contracts. Port IDs and node types are durable data and require migration planning when changed.
- Provider requests run in the request lifecycle. A future server-side queue would need a separate persistence and recovery design.

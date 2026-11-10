# Project assessment

## Functional scope

Znith Studio is a local browser workspace for assembling and running AI workflow graphs. It supports workflow creation from templates, graph editing, typed-port validation, undo/redo, import/export, execution history, and media reuse. The execution engine supports provider-backed text, image, and video nodes with retries, timeouts, and bounded concurrency. Generated results are returned to the browser and saved in IndexedDB.

Accounts, cross-device sync, team collaboration, and a durable background job queue are not implemented.

## Non-functional assessment

- **Maintainability:** UI, graph contracts, engine, browser persistence, and provider compute are separated into app features and shared contract workspaces.
- **Reliability:** Workflow definitions are validated and executions keep a snapshot plus node-level results. Unit tests cover workflow execution, request validation, contracts, and shared utilities.
- **Security:** Provider credentials are stored in browser IndexedDB and sent with provider requests. Anyone with access to that browser profile can access them. Multi-user hosting requires account ownership and server-side credential handling.
- **Scalability:** Provider calls execute within the request lifecycle today. Long-running or high-volume jobs will need durable queueing and server-side persistence before scaling.
- **Portability:** Studio data belongs to a browser profile and site origin, while provider gateways run in Docker Compose. Export browser data when moving to another device.

## Data and persistence

IndexedDB is the durable data layer for the current app. Its object stores are `workflows`, `executions`, `prompts`, `textAssets`, `media`, `assetFiles`, `generations`, and `settings`. Media metadata and binary file contents use separate stores. Data does not sync automatically between browsers or devices.

The old PostgreSQL migration files remain in the repository as historical records only. They are excluded from the active app build and are not run by Docker Compose.

## Technology and device targets

- **Web runtime:** Next.js 16 App Router, React 19, TypeScript.
- **Persistence:** Browser IndexedDB, with server routes used only for provider compute.
- **UI:** Tailwind CSS 4, React Flow, and Lucide icons.
- **Contracts and validation:** Zod schemas shared by the frontend and backend.
- **Tooling:** pnpm workspaces, Docker Compose, Vitest, Prettier, ESLint, Husky, Release Please, and GitHub Actions.
- **Target devices:** Modern desktop and mobile web browsers through responsive layouts. No native app or specialized hardware integration was found.

## Repository structure

App-specific UI and provider routes live in `apps/studio/`, and shared contracts live in workspace packages. Docker Compose builds the standalone Next.js app with optional provider gateways. Studio records stay in browser storage; named volumes retain gateway data and generated gateway keys.

# Project assessment

## Functional scope

Znith Studio is a web application for assembling and running AI workflow graphs. The current product supports workflow creation from templates, graph editing, typed-port validation, undo/redo, import/export, execution history, and reuse of uploaded media. The execution engine supports provider-backed text, image, and video nodes, with retries, timeouts, and bounded concurrency. Provider credentials are expected to remain in server-side environment settings.

The application is a single shared workspace. Public app-user accounts, per-user ownership, team collaboration, and a durable background job queue are not implemented. Generated image/video results can retain provider references, but output ingestion into Media is not yet a general persistence pipeline.

## Non-functional assessment

- **Maintainability:** UI, graph contracts, engine, and collection definitions are separated into app features, application/domain logic, persistence adapters, and shared contract workspaces.
- **Reliability:** Workflow definitions are validated and executions keep a snapshot plus node-level results. Unit tests cover the workflow engine, application services, asset validation, contracts, and shared utilities.
- **Security:** Provider and Payload secrets are server-only. Admin access uses Payload's local authentication. Before adding multi-user access, define app-user ownership and explicit collection access rules.
- **Scalability:** Provider calls execute within the request lifecycle today. Long-running or high-volume jobs will need durable queueing/recovery, such as Payload Jobs, before scaling that workload.
- **Portability:** The app and PostgreSQL run in Docker Compose, with persistent volumes for database data, media, and the Payload secret. The stack can be moved to a self-hosted Docker host with environment and backup configuration.

## Data and persistence

Payload is the durable data layer. PostgreSQL stores Admins, Media, Folders, Tags, Workflows, and Executions. Workflows hold graph definitions and list-facing status; Executions retain snapshots, logs, outputs, and node records; Media stores uploaded files and metadata.

A fresh Docker Compose database is initialized from the committed Payload migration. Records from another installation are not copied automatically; export/import is needed if those records must be retained.

Do not remove Folders or Tags as apparent unused collections: the Media collection composes Payload folder/tag fields and the generated Payload types include those relationships. If future usage metrics show actual orphan records, define a retention policy and review references before deleting them. Execution-history retention should also be a product decision because it is currently user-visible and useful for reproducibility.

## Technology and device targets

- **Web runtime:** Next.js 16 App Router, React 19, TypeScript.
- **Backend/content:** Payload CMS 4 with a PostgreSQL adapter and local file uploads.
- **UI:** Tailwind CSS 4, React Flow, and Lucide icons.
- **Contracts and validation:** Zod schemas shared by the frontend and backend.
- **Tooling:** pnpm workspaces, Docker Compose, Vitest, Prettier, ESLint, Husky, Release Please, and GitHub Actions.
- **Target devices:** Modern desktop and mobile web browsers through responsive layouts. No native app, local-device storage layer, or specialized hardware integration was found.

## Repository cleanup

The source tree keeps app-specific UI and backend modules in `apps/studio/` and shared contracts in workspace packages. Docker Compose builds the standalone Next.js app and PostgreSQL service together. Payload migrations initialize and evolve the relational schema; named volumes retain uploaded files, database data, and the generated signing secret.

# Project assessment

## Functional scope

Znith Studio is a web application for assembling and running AI workflow graphs. The current product supports workflow creation from templates, graph editing, typed-port validation, undo/redo, import/export, execution history, and reuse of uploaded media. The execution engine supports provider-backed text, image, and video nodes, with retries, timeouts, and bounded concurrency. Provider credentials are expected to remain in server-side environment settings.

The application is a single shared workspace. Public app-user accounts, per-user ownership, team collaboration, and a durable background job queue are not implemented. Generated image/video results can retain provider references, but output ingestion into Media is not yet a general persistence pipeline.

## Non-functional assessment

- **Maintainability:** Before the refactor, UI, graph contracts, engine, and collection definitions lived in the root Next.js source tree. The workspace now separates presentation, application/domain logic, Payload adapters, and shared contracts/utilities.
- **Reliability:** Workflow definitions are validated and executions keep a snapshot plus node-level results. Unit tests cover the workflow engine, application services, asset validation, contracts, and shared utilities.
- **Security:** Provider secrets are server-only. Payload/Figma supplies database, authentication, and file storage. Before adding multi-user access, define app-user ownership and explicit collection access rules; the Admins collection is for CMS control-plane access only.
- **Scalability:** Provider calls execute within the request lifecycle today. Long-running or high-volume jobs will need durable queueing/recovery, such as Payload Jobs, before scaling that workload.
- **Portability:** The browser app uses Next.js and responsive layouts; there is no native Android/iOS application or device-specific API integration. The Make-hosted Payload build requires Figma-provisioned environment configuration.

## Data and persistence

Payload is the durable data layer, hosted and managed by Figma Make. The registered collections are Admins, Media, Folders, Tags, Workflows, and Executions. Workflows hold graph definitions and list-facing status; Executions retain snapshots, logs, outputs, and node records; Media stores uploaded files and metadata.

No local database, SQL dump, seed-data directory, or application export file is present in the repository. Live Payload documents are not available for inspection from this source workspace, so no persisted records can be responsibly identified for deletion.

Do not remove Folders or Tags as apparent unused collections: the Media collection composes Payload folder/tag fields and the generated Payload types include those relationships. If future usage metrics show actual orphan records, define a retention policy and review references before deleting them. Execution-history retention should also be a product decision because it is currently user-visible and useful for reproducibility.

## Technology and device targets

- **Web runtime:** Next.js 16 App Router, React 19, TypeScript.
- **Backend/content:** Payload CMS 4 with the Figma Make integration; Figma manages the database, admin auth, storage, and deployment runtime.
- **UI:** Tailwind CSS 4, React Flow, and Lucide icons.
- **Contracts and validation:** Zod schemas shared by the frontend and backend.
- **Tooling:** pnpm workspaces, Vitest, Oxfmt, Husky, Changesets, and GitHub Actions.
- **Target devices:** Modern desktop and mobile web browsers through responsive layouts. No native app, local-device storage layer, or specialized hardware integration was found.

## Repository cleanup

The source refactor removed duplicated file placement by moving UI, backend, and contracts into their workspace packages. The unused `@payloadcms/plugin-cloud-storage` and `monaco-editor` root dependencies were removed; ordinary uploads continue to use the platform-managed Media collection. Generated Payload routes, schema types, Make lifecycle scripts, Folders, and Tags remain because they are platform-managed or referenced by the app.

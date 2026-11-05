# Architecture

## Workspace map

- **Studio app (`apps/studio/`)** owns the Next.js App Router, Payload Admin/API routes, application configuration, and runtime composition.
- **Studio features (`apps/studio/src/features/`)** contain route views, browser interactions, shared layout, and styles. They do not access Payload credentials or persistence directly.
- **Studio server (`apps/studio/src/server/`)** contains workflow and asset application services, repository ports, Payload adapters, provider execution, and collection definitions.
- **Contracts (`packages/contracts/`)** owns workflow DTOs, Zod request schemas, node types, provider catalog, registry, and starter templates. It has no dependency on React, Next.js, or Payload.
- **Utilities (`packages/utils/`)** contains pure functions reused across workspace boundaries.

Next.js transpiles the shared packages through `transpilePackages`. The Studio app is packaged as a standalone Next.js server and runs with PostgreSQL through Docker Compose.

## Dependency direction

```text
App Router handlers → application services → domain repository ports
                                         ↑
Payload repositories and provider engine ─┘

Frontend features → shared contracts and utilities
Backend services  → shared contracts and utilities
```

The route files are transport adapters. They validate request bodies, call the composed application service, and shape HTTP responses. `apps/studio/src/lib/backend-services.ts` injects the Payload Local API into backend repositories.

## Workflow execution

1. The API loads a workflow through `PayloadWorkflowRepository` with access checks enabled.
2. `WorkflowService` creates an execution record with an immutable workflow-definition snapshot.
3. The workflow engine checks node identifiers, edge ports, data types, required inputs, and cycles.
4. Ready nodes run with bounded concurrency, retry, and timeout settings.
5. The service persists node records, logs, duration, status, and errors, then updates the workflow's list-facing run status.
6. The editor reloads the latest execution and displays node outputs and execution history.

The snapshot is retained for reproducibility. Large binary media belongs in Payload's Media collection; workflow definitions should reference asset IDs and URLs only as needed by current execution behavior.

## Backend layers

- **Domain:** repository interfaces and domain-facing data contracts.
- **Application:** workflow and asset services that coordinate validation, template defaults, execution lifecycle, and file rules.
- **Infrastructure:** Payload Local API adapters, provider calls, and the graph execution engine.
- **Presentation:** Next.js route handlers in `apps/studio/src/app/(frontend)/api/studio`, kept thin and independent of persistence details.

## Security and operations

- Provider keys and Payload secrets are server-only environment variables and are never stored in workflow exports.
- PostgreSQL stores collection records. Payload uploads live in a persistent Docker volume.
- Docker Compose waits for PostgreSQL readiness before starting the app. The Payload migration set is applied by the app during production startup.
- Workflow definitions are versioned JSON contracts. Port IDs and node types are durable data and require migration planning when changed.
- The current application is a shared single-tenant workspace. Add app-user authentication, ownership relationships, and narrower collection access before serving private multi-user workspaces.
- Long-running provider jobs currently execute in the request lifecycle. Durable queueing and recovery should use Payload Jobs when asynchronous execution is introduced.

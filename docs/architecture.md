# Architecture

## Workspace map

- **Figma Make host (`src/`)** is the root Next.js deployment shell. It owns App Router entry points, Payload's generated Admin/API routes, `payload.config.ts`, and the integration composition root.
- **Frontend (`fe/`)** contains route-level view components, browser interactions, shared layout, and styles. It does not access Payload credentials or persistence directly.
- **Backend (`be/`)** contains workflow and asset application services, repository ports, Payload repository adapters, provider execution, and collection definitions.
- **Contracts (`packages/contracts/`)** owns workflow DTOs, Zod request schemas, node types, provider catalog, registry, and starter templates. It has no dependency on React, Next.js, or Payload.
- **Utilities (`packages/utils/`)** contains pure functions reused across workspace boundaries.

Next.js transpiles local packages through `transpilePackages`; the Make host remains at the repository root so Figma's `.figma/make` lifecycle and Payload route conventions remain intact.

## Dependency direction

```text
App Router handlers → application services → domain repository ports
                                         ↑
Payload repositories and provider engine ─┘

Frontend components → shared contracts and utilities
Backend services   → shared contracts and utilities
```

The root route files are transport adapters. They validate request bodies, call the composed application service, and shape HTTP responses. The `src/lib/backend-services.ts` composition root injects the Make-provided Payload client into backend repositories.

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
- **Presentation:** Next.js route handlers in `src/app/(frontend)/api/studio`, kept thin and independent of persistence details.

## Security and operational boundaries

- Provider keys are server-only environment variables and are never stored in workflow exports.
- Payload/Figma database, auth, and file storage are platform-managed; this repository does not configure an adapter or local database.
- Workflow definitions are versioned JSON contracts. Port IDs and node types are durable data and require migration planning when changed.
- The current application is a shared single-tenant workspace. Add app-user authentication, ownership relationships, and narrower collection access before serving private multi-user workspaces.
- Long-running provider jobs currently execute in the request lifecycle. Durable queueing and recovery should use Payload Jobs when asynchronous execution is introduced.

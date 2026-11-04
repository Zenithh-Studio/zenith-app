# Architecture

## Boundaries

- **UI (`src/components/studio`)** renders workflow management and the XYFlow editor. It never reads provider credentials.
- **Contracts and registry (`src/core/workflow`)** define typed ports, workflow JSON, node metadata, and execution records independently of React.
- **Execution engine (`src/core/workflow/engine.ts`)** validates the graph, builds dependency order, resolves values by source/target handle, invokes handlers, and returns normalized records and logs.
- **Application API (`src/app/(frontend)/api/studio`)** validates public input, accesses Payload with access control enabled, snapshots workflows, invokes the engine, and persists outcomes.
- **Payload (`workflows`, `executions`)** stores durable definitions, metadata, exact execution snapshots, node output records, and logs.

## Execution lifecycle

1. The route loads the persisted workflow.
2. It writes a running execution containing an immutable definition snapshot.
3. The engine validates node IDs, definitions, ports, data types, cardinality, required inputs, and acyclicity.
4. Ready nodes run concurrently within a bounded worker limit. Each input is resolved from a specific upstream output handle.
5. Node-level timeout and retry policies use bounded exponential backoff. Failed dependencies mark downstream work as skipped while independent branches continue.
6. The route persists normalized node records, logs, duration, final status, and errors.
7. The editor reloads the latest execution and renders output/status on each node.

Large media should be represented by Payload Media relationships and asset IDs, not embedded in workflow JSON. Media adapters remain unavailable in this deployment because no compatible provider credentials were supplied.

## Security posture

- Provider secrets are server-only environment variables.
- Workflow exports contain definitions but never environment variables.
- User input is allowlisted with Zod at application routes.
- Payload collection access is explicit. This Make workspace is intentionally a shared single-tenant studio; add app-user authentication and owner relationships before exposing private multi-user workspaces.
- OpenAI errors are normalized without logging request authorization headers.

## Extension points

Additional provider adapters should normalize modality-specific requests and outputs behind node executors. Async providers should persist provider job IDs in execution records and use Payload Jobs for polling/recovery.

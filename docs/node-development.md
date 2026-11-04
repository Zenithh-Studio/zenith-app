# Node development

Every node begins with a definition in `src/core/workflow/registry.ts`.

1. Choose a stable, namespaced type ID such as `processing.transform-json`.
2. Define version, category, description, typed input/output ports, and default configuration.
3. Add an executor branch in `executeNode()` that returns `Record<outputPortId, NodeValue>`.
4. Validate configuration and external responses before producing outputs.
5. Keep credentials in server environment variables; never place them in node configuration or output metadata.
6. Mark unavailable nodes with `available: false` and a specific reason.
7. Add engine tests covering port mapping, missing inputs, failure behavior, and normalized output.

Port IDs are durable API contracts. Changing an existing ID requires a workflow definition migration. Large binary values must use asset references rather than inline base64.

An executor must either return a real result or throw a clear error. Mock provider results are not permitted.

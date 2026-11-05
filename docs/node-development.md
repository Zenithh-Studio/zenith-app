# Node Development

Workflow node contracts live in `packages/contracts/src/workflow/registry.ts`. Execution behavior lives in `apps/studio/src/server/modules/workflows/infrastructure/engine.ts`, while the editor renders the metadata in `apps/studio/src/features/studio/presentation/components/studio/WorkflowEditor.tsx`.

## Add a node

1. Choose a stable type ID such as `processing.transform-json`.
2. Add its version, category, description, typed ports, and default configuration to the shared registry.
3. Implement execution in the backend engine. Return a value for each declared output port or throw a clear error.
4. Add configuration controls in the frontend only when the node needs custom inputs beyond generic configuration.
5. Validate configuration and external responses before producing outputs.
6. Keep credentials in server environment variables; never put secret values in node configuration or output metadata.
7. Add unit tests for validation, port mapping, execution results, and failure behavior.

Port IDs and node type IDs are persisted in workflow definitions. Changing an existing identifier needs a data migration plan. Large files must be represented by Media asset references rather than inline base64.

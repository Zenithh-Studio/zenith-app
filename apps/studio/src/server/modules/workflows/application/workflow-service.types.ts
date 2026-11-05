import type {
  NodeExecutionRecord,
  NodeValue,
  WorkflowNode,
  WorkflowRunResult,
} from '@znith/contracts'

export type EngineResult = WorkflowRunResult

export interface WorkflowOutputPersistenceResult {
  outputs: Record<string, NodeValue>
  warnings?: string[]
}

export interface WorkflowRunOptions {
  concurrency?: number
  persistNodeOutputs?: (
    node: WorkflowNode,
    outputs: Record<string, NodeValue>,
  ) => Promise<WorkflowOutputPersistenceResult>
  onNodeRecord?: (record: NodeExecutionRecord) => Promise<void>
}

export interface WorkflowOutputPersister {
  persist(
    workflowId: string,
    executionId: string,
    node: WorkflowNode,
    outputs: Record<string, NodeValue>,
  ): Promise<WorkflowOutputPersistenceResult>
}

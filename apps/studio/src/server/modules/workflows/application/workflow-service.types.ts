import type {
  ExecutionLog,
  NodeExecutionRecord,
  NodeValue,
  WorkflowNode,
  WorkflowRunResult,
} from '@znith/contracts'

export type EngineResult = WorkflowRunResult

export type WorkflowVideoTaskResult = {
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled'
  url?: string
  error?: string
}

export type WorkflowVideoTaskChecker = (task: {
  provider: string
  model: string
  taskId: string
}) => Promise<WorkflowVideoTaskResult>

export interface WorkflowOutputPersistenceResult {
  outputs: Record<string, NodeValue>
  warnings?: string[]
}

export interface WorkflowRunOptions {
  concurrency?: number
  targetNodeIds?: string[]
  initialRecords?: NodeExecutionRecord[]
  signal?: AbortSignal
  onProviderTask?: (
    nodeId: string,
    task: { provider: string; model: string; taskId: string },
  ) => Promise<void> | void
  persistNodeOutputs?: (
    node: WorkflowNode,
    outputs: Record<string, NodeValue>,
  ) => Promise<WorkflowOutputPersistenceResult>
  onNodeRecord?: (record: NodeExecutionRecord) => Promise<void>
  onExecutionLog?: (log: ExecutionLog) => Promise<void>
}

export interface WorkflowOutputPersister {
  persist(
    workflowId: string,
    executionId: string,
    node: WorkflowNode,
    outputs: Record<string, NodeValue>,
    provenance?: { sourceGenerationId?: string },
  ): Promise<WorkflowOutputPersistenceResult>
}

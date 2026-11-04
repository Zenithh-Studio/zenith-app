export type DataType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'file' | 'number' | 'boolean'

export type ExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'waiting_for_input'

export interface NodePort {
  id: string
  name: string
  dataType: DataType
  required: boolean
  multiple: boolean
}

export interface WorkflowNode {
  id: string
  type: string
  name: string
  slug?: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface WorkflowDefinition {
  version: 1
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface NodeValue<T = unknown> {
  type: DataType
  value: T
  metadata?: Record<string, unknown>
  assetId?: string
}

export interface NodeExecutionRecord {
  nodeId: string
  status: ExecutionStatus
  startedAt?: string
  completedAt?: string
  durationMs?: number
  outputs?: Record<string, NodeValue>
  error?: string
}

export interface NodeDefinition {
  type: string
  version: number
  displayName: string
  category: 'Input' | 'AI' | 'Processing' | 'Output' | 'Utility'
  description: string
  inputs: NodePort[]
  outputs: NodePort[]
  defaultConfig: Record<string, unknown>
  available: boolean
  unavailableReason?: string
}

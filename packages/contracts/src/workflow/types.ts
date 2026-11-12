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

export type WorkflowStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

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

export interface WorkflowGroup {
  id: string
  name: string
  description?: string
  color?: string
  collapsed?: boolean
  nodeIds: string[]
  position: { x: number; y: number }
  width: number
  height: number
}

export interface WorkflowDefinition {
  version: 1
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  groups?: WorkflowGroup[]
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
  providerTask?: {
    provider: string
    model: string
    taskId: string
    lastPolledAt?: string
  }
}

export interface WorkflowDocument {
  id: string
  name: string
  description?: string | null
  category: 'custom' | 'creative' | 'story' | 'video' | 'automation'
  status: WorkflowStatus
  lastExecutionAt?: string | null
  definition: WorkflowDefinition
  createdAt: string
  updatedAt: string
}

export interface ExecutionLog {
  at: string
  level: 'info' | 'error'
  message: string
  nodeId?: string
}

export interface WorkflowRunResult {
  status: 'succeeded' | 'failed' | 'cancelled'
  records: NodeExecutionRecord[]
  logs: ExecutionLog[]
  error?: string
}

export interface ExecutionDocument {
  id: string
  workflow?: string | WorkflowDocument | null
  retryOf?: string | null
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  scope: string
  startedAt: string
  completedAt?: string | null
  durationMs?: number | null
  snapshot: WorkflowDefinition
  nodeRecords: NodeExecutionRecord[]
  logs: ExecutionLog[]
  error?: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetDocument {
  id: string
  url?: string | null
  storageKey?: string
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  alt: string
  source?: 'upload' | 'workflow' | 'studio' | 'derived' | null
  sourceExecution?: string | { id: string } | null
  createdAt: string
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

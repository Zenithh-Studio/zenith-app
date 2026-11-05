import type { ExecutionDocument, WorkflowDocument, WorkflowStatus } from '@znith/contracts'

export type WorkflowCreateRecord = Pick<
  WorkflowDocument,
  'name' | 'description' | 'category' | 'status' | 'definition'
>

export type WorkflowUpdateRecord = Partial<
  Pick<WorkflowDocument, 'name' | 'description' | 'definition' | 'status' | 'lastExecutionAt'>
>

export type ExecutionCreateRecord = Pick<
  ExecutionDocument,
  'workflow' | 'status' | 'scope' | 'startedAt' | 'snapshot' | 'nodeRecords' | 'logs'
>

export type ExecutionUpdateRecord = Partial<
  Pick<
    ExecutionDocument,
    'status' | 'completedAt' | 'durationMs' | 'nodeRecords' | 'logs' | 'error'
  >
>

export interface WorkflowRepository {
  listWorkflows(search?: string): Promise<WorkflowDocument[]>
  findWorkflowById(id: string): Promise<WorkflowDocument | null>
  createWorkflow(data: WorkflowCreateRecord): Promise<WorkflowDocument>
  updateWorkflow(id: string, data: WorkflowUpdateRecord): Promise<WorkflowDocument>
  deleteWorkflow(id: string): Promise<void>
  listExecutions(workflowId: string, limit: number): Promise<ExecutionDocument[]>
  createExecution(data: ExecutionCreateRecord): Promise<ExecutionDocument>
  updateExecution(id: string, data: ExecutionUpdateRecord): Promise<ExecutionDocument>
  updateWorkflowRunState(id: string, status: WorkflowStatus, lastExecutionAt: string): Promise<void>
}

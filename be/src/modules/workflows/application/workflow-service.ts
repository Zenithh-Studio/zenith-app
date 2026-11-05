import {
  createWorkflowRequestSchema,
  executeWorkflowRequestSchema,
  updateWorkflowRequestSchema,
  workflowTemplates,
} from '@znith/contracts'
import { cloneValue } from '@znith/utils'
import type {
  CreateWorkflowRequest,
  ExecutionDocument,
  ExecuteWorkflowRequest,
  NodeExecutionRecord,
  WorkflowDefinition,
  WorkflowDocument,
  WorkflowStatus,
} from '@znith/contracts'
import type { EngineResult, WorkflowRunOptions } from './workflow-service.types'
import type { WorkflowMediaPersister } from './workflow-media-persister'
import type {
  ExecutionCreateRecord,
  WorkflowCreateRecord,
  WorkflowRepository,
} from '../domain/workflow-repository'

export interface WorkflowRunner {
  (
    definition: WorkflowDefinition,
    targetNodeId?: string,
    options?: WorkflowRunOptions,
  ): Promise<EngineResult>
}

export interface WorkflowRunResponse extends EngineResult {
  executionId: string
}

export class WorkflowService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly runWorkflow: WorkflowRunner,
    private readonly now: () => Date = () => new Date(),
    private readonly mediaPersister?: WorkflowMediaPersister,
  ) {}

  async listWorkflows(search?: string) {
    return this.repository.listWorkflows(search?.trim() || undefined)
  }

  async createWorkflow(input: CreateWorkflowRequest) {
    const validatedInput = createWorkflowRequestSchema.parse(input)
    const template = workflowTemplates[validatedInput.templateId]
    const newWorkflow: WorkflowCreateRecord = {
      name: validatedInput.name ?? template.name,
      description: validatedInput.description ?? template.description,
      category: template.category as WorkflowDocument['category'],
      status: 'idle',
      definition: cloneValue(validatedInput.definition ?? template.definition),
    }
    return this.repository.createWorkflow(newWorkflow)
  }

  async getWorkflow(id: string): Promise<{
    workflow: WorkflowDocument | null
    executions: ExecutionDocument[]
  }> {
    const [workflow, executions] = await Promise.all([
      this.repository.findWorkflowById(id),
      this.repository.listExecutions(id, 20),
    ])
    return { workflow, executions }
  }

  async updateWorkflow(id: string, input: unknown) {
    const validatedInput = updateWorkflowRequestSchema.parse(input)
    if (!(await this.repository.findWorkflowById(id))) return null
    return this.repository.updateWorkflow(id, validatedInput)
  }

  async deleteWorkflow(id: string) {
    if (!(await this.repository.findWorkflowById(id))) return false
    await this.repository.deleteWorkflow(id)
    return true
  }

  async execute(id: string, input: ExecuteWorkflowRequest): Promise<WorkflowRunResponse | null> {
    const validatedInput = executeWorkflowRequestSchema.parse(input)
    const workflow = await this.repository.findWorkflowById(id)
    if (!workflow) return null

    const startedAt = this.now()
    const snapshot = cloneValue(workflow.definition)
    const executionInput: ExecutionCreateRecord = {
      workflow: id,
      status: 'running',
      scope: validatedInput.targetNodeId
        ? `node:${validatedInput.targetNodeId}:with-dependencies`
        : 'workflow',
      startedAt: startedAt.toISOString(),
      snapshot,
      nodeRecords: [],
      logs: [],
    }
    const execution = await this.repository.createExecution(executionInput)
    await this.repository.updateWorkflowRunState(id, 'running', startedAt.toISOString())

    const nodeRecordsById = new Map<string, NodeExecutionRecord>()
    let nodeRecordWrites = Promise.resolve()
    const onNodeRecord = async (record: NodeExecutionRecord) => {
      nodeRecordsById.set(record.nodeId, cloneValue(record))
      const nodeRecords = [...nodeRecordsById.values()].map((nodeRecord) => cloneValue(nodeRecord))
      nodeRecordWrites = nodeRecordWrites
        .then(async () => {
          await this.repository.updateExecution(execution.id, { nodeRecords })
        })
        .catch(() => undefined)
      await nodeRecordWrites
    }

    const runResult = await this.runWorkflow(snapshot, validatedInput.targetNodeId, {
      ...(this.mediaPersister
        ? {
            persistNodeOutputs: (node, outputs) =>
              this.mediaPersister!.persist(id, execution.id, node, outputs),
          }
        : {}),
      onNodeRecord,
    })
    await nodeRecordWrites
    const completedAt = this.now()
    const nodeRecords: NodeExecutionRecord[] = runResult.records
    await this.repository.updateExecution(execution.id, {
      status: runResult.status,
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      nodeRecords,
      logs: runResult.logs,
      error: runResult.error,
    })
    await this.repository.updateWorkflowRunState(
      id,
      runResult.status as WorkflowStatus,
      completedAt.toISOString(),
    )

    return { executionId: execution.id, ...runResult }
  }
}

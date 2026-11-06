import {
  createWorkflowRequestSchema,
  executeWorkflowRequestSchema,
  updateWorkflowRequestSchema,
  validateWorkflowDefinition,
  workflowTemplates,
} from '@znith/contracts'
import { cloneValue } from '@znith/utils'
import { logServerEvent } from '../../../../lib/server-logger'
import type {
  CreateWorkflowRequest,
  ExecutionDocument,
  ExecutionLog,
  ExecuteWorkflowRequest,
  NodeExecutionRecord,
  WorkflowDefinition,
  WorkflowDocument,
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

const activeWorkflowRuns = new Set<string>()
const staleWorkflowRunMs = 6 * 60 * 1000
const workflowRunHeartbeatMs = 60 * 1000

export class WorkflowAlreadyRunningError extends Error {
  constructor() {
    super('This workflow is already running.')
    this.name = 'WorkflowAlreadyRunningError'
  }
}

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowValidationError'
  }
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
    if (activeWorkflowRuns.has(id)) throw new WorkflowAlreadyRunningError()
    activeWorkflowRuns.add(id)

    let claimed = false
    let execution: ExecutionDocument | undefined
    let snapshot: WorkflowDefinition | undefined
    let startedAt: Date | undefined
    let finishing = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let heartbeatWrites: Promise<void> = Promise.resolve()
    let nodeRecordWrites: Promise<void> = Promise.resolve()
    let executionLogWrites: Promise<void> = Promise.resolve()
    const executionLogs: ExecutionLog[] = []
    const stopHeartbeat = () => {
      finishing = true
      if (heartbeat) clearInterval(heartbeat)
    }

    try {
      const workflow = await this.repository.findWorkflowById(id)
      if (!workflow) return null

      snapshot = cloneValue(workflow.definition)
      try {
        validateWorkflowDefinition(snapshot, validatedInput.targetNodeId)
      } catch (error) {
        throw new WorkflowValidationError(
          error instanceof Error ? error.message : 'Invalid workflow definition.',
        )
      }

      startedAt = this.now()
      const startedAtISO = startedAt.toISOString()
      const claim = await this.repository.claimWorkflowRun(
        id,
        startedAtISO,
        new Date(startedAt.getTime() - staleWorkflowRunMs).toISOString(),
      )
      if (!claim) throw new WorkflowAlreadyRunningError()
      claimed = true

      if (claim === 'reclaimed') {
        const recoveredAt = this.now()
        const previousExecutions = await this.repository.listExecutions(id, 20)
        for (const previousExecution of previousExecutions) {
          if (previousExecution.status !== 'running') continue
          await this.repository.updateExecution(previousExecution.id, {
            status: 'interrupted',
            completedAt: recoveredAt.toISOString(),
            durationMs: Math.max(
              0,
              recoveredAt.getTime() - new Date(previousExecution.startedAt).getTime(),
            ),
            error: 'Execution was interrupted because its server process stopped.',
          })
        }
      }

      const executionInput: ExecutionCreateRecord = {
        workflow: id,
        status: 'running',
        scope: validatedInput.targetNodeId
          ? `node:${validatedInput.targetNodeId}:with-dependencies`
          : 'workflow',
        startedAt: startedAtISO,
        snapshot,
        nodeRecords: [],
        logs: [],
      }
      execution = await this.repository.createExecution(executionInput)
      logServerEvent('info', 'workflow.execution.started', {
        workflowId: id,
        executionId: execution.id,
        nodeCount: snapshot.nodes.length,
      })

      const heartbeatRun = () => {
        if (finishing) return
        heartbeatWrites = heartbeatWrites
          .then(async () => {
            if (!finishing) {
              await this.repository.updateWorkflowRunState(id, 'running', this.now().toISOString())
            }
          })
          .catch(() => undefined)
      }
      heartbeat = setInterval(heartbeatRun, workflowRunHeartbeatMs)
      heartbeat.unref?.()

      const nodeRecordsById = new Map<string, NodeExecutionRecord>()
      const onNodeRecord = async (record: NodeExecutionRecord) => {
        nodeRecordsById.set(record.nodeId, cloneValue(record))
        const nodeRecords = [...nodeRecordsById.values()].map((nodeRecord) =>
          cloneValue(nodeRecord),
        )
        nodeRecordWrites = nodeRecordWrites
          .then(async () => {
            await this.repository.updateExecution(execution!.id, { nodeRecords })
          })
          .catch(() => undefined)
        await nodeRecordWrites
      }
      const onExecutionLog = async (log: ExecutionLog) => {
        executionLogs.push(cloneValue(log))
        const logs = executionLogs.map((entry) => cloneValue(entry))
        executionLogWrites = executionLogWrites
          .then(async () => {
            await this.repository.updateExecution(execution!.id, { logs })
          })
          .catch(() => undefined)
        await executionLogWrites
      }

      let runResult: EngineResult
      try {
        runResult = await this.runWorkflow(snapshot, validatedInput.targetNodeId, {
          ...(this.mediaPersister
            ? {
                persistNodeOutputs: (node, outputs) =>
                  this.mediaPersister!.persist(id, execution!.id, node, outputs),
              }
            : {}),
          onNodeRecord,
          onExecutionLog,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workflow execution failed.'
        runResult = {
          status: 'failed',
          records: [...nodeRecordsById.values()],
          logs: [{ at: this.now().toISOString(), level: 'error', message }],
          error: message,
        }
      }
      await nodeRecordWrites
      await executionLogWrites
      stopHeartbeat()
      await heartbeatWrites

      const completedAt = this.now()
      const nodeRecords: NodeExecutionRecord[] = runResult.records
      const durationMs = completedAt.getTime() - startedAt.getTime()
      await this.repository.updateExecution(execution.id, {
        status: runResult.status,
        completedAt: completedAt.toISOString(),
        durationMs,
        nodeRecords,
        logs: runResult.logs,
        error: runResult.error,
      })
      await this.repository.updateWorkflowRunState(id, runResult.status, completedAt.toISOString())
      logServerEvent(
        runResult.status === 'failed' ? 'warn' : 'info',
        'workflow.execution.completed',
        {
          workflowId: id,
          executionId: execution.id,
          status: runResult.status,
          durationMs,
          nodeCount: snapshot.nodes.length,
          failedNodeCount: nodeRecords.filter((record) => record.status === 'failed').length,
        },
      )

      return { executionId: execution.id, ...runResult }
    } catch (error) {
      stopHeartbeat()
      await Promise.all([heartbeatWrites, nodeRecordWrites, executionLogWrites])
      if (claimed && startedAt) {
        const failedAt = this.now()
        const message = error instanceof Error ? error.message : 'Workflow execution failed.'
        if (execution) {
          try {
            await this.repository.updateExecution(execution.id, {
              status: 'failed',
              completedAt: failedAt.toISOString(),
              durationMs: Math.max(0, failedAt.getTime() - startedAt.getTime()),
              error: message,
            })
          } catch {
            // Preserve the original execution error if persistence is unavailable.
          }
        }
        try {
          await this.repository.updateWorkflowRunState(id, 'failed', failedAt.toISOString())
        } catch {
          // The stale-run lease will recover the workflow if the database is unavailable.
        }
      }
      throw error
    } finally {
      stopHeartbeat()
      activeWorkflowRuns.delete(id)
    }
  }
}

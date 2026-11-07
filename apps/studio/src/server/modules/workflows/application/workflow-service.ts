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
import type {
  EngineResult,
  WorkflowRunOptions,
  WorkflowVideoTaskChecker,
} from './workflow-service.types'
import type { WorkflowMediaPersister } from './workflow-media-persister'
import { WorkflowAssetReferenceCleaner } from './workflow-asset-reference-cleaner'
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
const activeWorkflowAbortControllers = new Map<string, AbortController>()
const staleWorkflowRunMs = 6 * 60 * 1000
const workflowRunHeartbeatMs = 60 * 1000

function safeWorkflowError(message: string) {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
    .slice(0, 2000)
}

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
    private readonly checkVideoTask?: WorkflowVideoTaskChecker,
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

  async saveNodeOutputToAssets(workflowId: string, nodeId: string, executionId?: string) {
    const workflow = await this.repository.findWorkflowById(workflowId)
    if (!workflow) return null
    if (!this.mediaPersister) {
      throw new WorkflowValidationError('Saving generated media is not available.')
    }

    const executions = executionId
      ? [await this.repository.findExecutionById(executionId)].filter((item) => item !== null)
      : await this.repository.listExecutions(workflowId, 20)
    const execution = executions.find((item) => {
      const executionWorkflowId =
        typeof item.workflow === 'string' ? item.workflow : item.workflow?.id
      return (
        executionWorkflowId === workflowId &&
        item.nodeRecords?.some(
          (record) =>
            record.nodeId === nodeId &&
            Object.values(record.outputs || {}).some((output) =>
              ['image', 'video', 'audio'].includes(output.type),
            ),
        )
      )
    })
    if (!execution) return null

    const node = execution.snapshot.nodes.find((item) => item.id === nodeId)
    const recordIndex = execution.nodeRecords.findIndex((item) => item.nodeId === nodeId)
    const record = execution.nodeRecords[recordIndex]
    if (!node || !record?.outputs) return null

    const persisted = await this.mediaPersister.persist(
      workflowId,
      execution.id,
      node,
      record.outputs,
    )
    if (persisted.warnings?.length) {
      throw new WorkflowValidationError(persisted.warnings.join(' '))
    }

    const nodeRecords = [...execution.nodeRecords]
    nodeRecords[recordIndex] = { ...record, outputs: persisted.outputs }
    await this.repository.updateExecution(execution.id, { nodeRecords })
    return { executionId: execution.id, nodeId, outputs: persisted.outputs }
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

  async cancel(id: string) {
    if (!(await this.repository.findWorkflowById(id))) return false
    const controller = activeWorkflowAbortControllers.get(id)
    if (!controller) return false
    controller.abort(new Error('Execution was cancelled by the user.'))
    return true
  }

  async refreshVideoTask(executionId: string, expectedWorkflowId?: string) {
    const execution = await this.repository.findExecutionById(executionId)
    if (!execution) return { status: 'not-found' as const }
    if (!execution.workflow) return { status: 'not-found' as const }
    const workflowId =
      typeof execution.workflow === 'string' ? execution.workflow : execution.workflow.id
    if (expectedWorkflowId && workflowId !== expectedWorkflowId) {
      return { status: 'not-found' as const }
    }
    if (execution.status !== 'running' && execution.status !== 'interrupted') {
      return { status: execution.status, execution }
    }
    if (activeWorkflowRuns.has(workflowId)) return { status: 'running' as const, execution }

    const pendingRecord = [...execution.nodeRecords]
      .reverse()
      .find((record) => record.providerTask && ['running', 'interrupted'].includes(record.status))
    if (!pendingRecord?.providerTask) return { status: 'no-task' as const, execution }
    if (!this.checkVideoTask) throw new Error('Video task checks are not configured.')

    const checkedAt = this.now().toISOString()
    const task = pendingRecord.providerTask
    let check: Awaited<ReturnType<WorkflowVideoTaskChecker>>
    try {
      check = await this.checkVideoTask(task)
    } catch (failure) {
      const message = safeWorkflowError(
        failure instanceof Error ? failure.message : 'Video task status could not be checked.',
      )
      throw new Error(message)
    }
    const polledRecord = {
      ...pendingRecord,
      providerTask: { ...task, lastPolledAt: checkedAt },
    }
    const recordsAfterPoll = execution.nodeRecords.map((record) =>
      record.nodeId === pendingRecord.nodeId ? polledRecord : record,
    )
    if (check.status === 'pending') {
      const updated = await this.repository.updateExecution(execution.id, {
        nodeRecords: recordsAfterPoll,
      })
      return { status: 'pending' as const, execution: updated }
    }

    const startedAt = this.now()
    const claimed = await this.repository.claimWorkflowRun(
      workflowId,
      startedAt.toISOString(),
      new Date(startedAt.getTime() - staleWorkflowRunMs).toISOString(),
    )
    if (!claimed) return { status: 'running' as const, execution }
    activeWorkflowRuns.add(workflowId)
    const abortController = new AbortController()
    activeWorkflowAbortControllers.set(workflowId, abortController)
    const executionLogs = [...execution.logs]
    let logWrites = Promise.resolve()
    let recordWrites = Promise.resolve()
    let heartbeatWrites = Promise.resolve()
    let finishing = false
    const heartbeat = setInterval(() => {
      if (finishing) return
      heartbeatWrites = heartbeatWrites
        .then(() =>
          this.repository.updateWorkflowRunState(workflowId, 'running', this.now().toISOString()),
        )
        .catch(() => undefined)
    }, workflowRunHeartbeatMs)
    heartbeat.unref?.()

    const stopHeartbeat = () => {
      finishing = true
      clearInterval(heartbeat)
    }
    const persistExecutionLogs = () => {
      const logs = executionLogs.map((log) => cloneValue(log))
      logWrites = logWrites
        .then(async () => {
          await this.repository.updateExecution(execution.id, { logs })
        })
        .catch(() => undefined)
      return logWrites
    }
    const nodeRecordsById = new Map(
      recordsAfterPoll.map((record) => [record.nodeId, cloneValue(record)]),
    )
    const persistNodeRecord = (record: NodeExecutionRecord) => {
      nodeRecordsById.set(record.nodeId, cloneValue(record))
      const nodeRecords = [...nodeRecordsById.values()].map((entry) => cloneValue(entry))
      recordWrites = recordWrites
        .then(async () => {
          await this.repository.updateExecution(execution.id, { nodeRecords })
        })
        .catch(() => undefined)
      return recordWrites
    }
    const appendLog = (log: ExecutionLog) => {
      executionLogs.push(cloneValue(log))
      return persistExecutionLogs()
    }

    try {
      let recoveredRecord: NodeExecutionRecord = polledRecord
      if (check.status !== 'succeeded') {
        const message = safeWorkflowError(check.error || `Provider task ${check.status}.`)
        recoveredRecord = {
          ...polledRecord,
          status: check.status,
          completedAt: checkedAt,
          error: message,
        }
        await persistNodeRecord(recoveredRecord)
        await appendLog({
          at: checkedAt,
          level: check.status === 'failed' ? 'error' : 'info',
          nodeId: recoveredRecord.nodeId,
          message: `Video provider task ${check.status}: ${message}`,
        })
        stopHeartbeat()
        await Promise.all([recordWrites, logWrites, heartbeatWrites])
        const completedAt = this.now()
        const updated = await this.repository.updateExecution(execution.id, {
          status: check.status === 'cancelled' ? 'cancelled' : 'failed',
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - new Date(execution.startedAt).getTime()),
          nodeRecords: [...nodeRecordsById.values()],
          logs: executionLogs,
          error: message,
        })
        await this.repository.updateWorkflowRunState(
          workflowId,
          check.status === 'cancelled' ? 'cancelled' : 'failed',
          completedAt.toISOString(),
        )
        return { status: check.status, execution: updated }
      }

      if (!check.url) throw new Error('The video task succeeded without a result URL.')
      if (!this.mediaPersister) throw new Error('Workflow media storage is not configured.')
      const workflow = await this.repository.findWorkflowById(workflowId)
      if (!workflow) return { status: 'not-found' as const }
      const snapshot = cloneValue(execution.snapshot)
      const node = snapshot.nodes.find((item) => item.id === pendingRecord.nodeId)
      if (!node || !['ai.generate-video', 'ai.image-to-video'].includes(node.type)) {
        throw new Error('The saved video task no longer matches its execution snapshot.')
      }
      const persisted = await this.mediaPersister.persist(workflowId, execution.id, node, {
        video: {
          type: 'video',
          value: { url: check.url },
          metadata: { provider: task.provider, model: task.model, providerJobId: task.taskId },
        },
      })
      const videoOutput = persisted.outputs.video
      if (!videoOutput || !(videoOutput.assetId || videoOutput.metadata?.assetId)) {
        throw new Error(persisted.warnings?.[0] || 'The video result could not be saved to Assets.')
      }
      const completedAt = this.now()
      recoveredRecord = {
        ...polledRecord,
        status: 'succeeded',
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(
          0,
          completedAt.getTime() -
            new Date(pendingRecord.startedAt || execution.startedAt).getTime(),
        ),
        outputs: { video: videoOutput },
      }
      await persistNodeRecord(recoveredRecord)
      await appendLog({
        at: completedAt.toISOString(),
        level: 'info',
        nodeId: recoveredRecord.nodeId,
        message: 'Video task completed and was saved to Assets. Resuming the saved workflow scope.',
      })

      const groupMatch = /^group:(.*)$/.exec(execution.scope)
      const nodeMatch = /^node:(.*):with-dependencies$/.exec(execution.scope)
      const group = groupMatch
        ? snapshot.groups?.find((item) => item.id === groupMatch[1])
        : undefined
      if (groupMatch && !group) throw new Error('The saved execution group is missing.')
      const initialRecords = [...nodeRecordsById.values()]
      const runResult = await this.runWorkflow(snapshot, nodeMatch?.[1], {
        signal: abortController.signal,
        initialRecords,
        ...(group ? { targetNodeIds: group.nodeIds } : {}),
        onNodeRecord: persistNodeRecord,
        onExecutionLog: appendLog,
        onProviderTask: async (nodeId, providerTask) => {
          const existing = nodeRecordsById.get(nodeId)
          if (!existing) return
          await persistNodeRecord({ ...existing, providerTask })
        },
        persistNodeOutputs: (currentNode, outputs) =>
          this.mediaPersister!.persist(workflowId, execution.id, currentNode, outputs),
      })
      await Promise.all([recordWrites, logWrites])
      stopHeartbeat()
      await heartbeatWrites
      const finishedAt = this.now()
      const finalRecords = [...nodeRecordsById.values()]
      const updated = await this.repository.updateExecution(execution.id, {
        status: runResult.status,
        completedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - new Date(execution.startedAt).getTime()),
        nodeRecords: finalRecords,
        logs: executionLogs,
        error: runResult.error,
      })
      await this.repository.updateWorkflowRunState(
        workflowId,
        runResult.status,
        finishedAt.toISOString(),
      )
      return { status: 'resumed' as const, execution: updated }
    } catch (error) {
      stopHeartbeat()
      await Promise.all([recordWrites, logWrites, heartbeatWrites])
      const failedAt = this.now()
      const message = safeWorkflowError(
        error instanceof Error ? error.message : 'Video task recovery failed.',
      )
      await appendLog({ at: failedAt.toISOString(), level: 'error', message })
      const updated = await this.repository.updateExecution(execution.id, {
        status: 'failed',
        completedAt: failedAt.toISOString(),
        durationMs: Math.max(0, failedAt.getTime() - new Date(execution.startedAt).getTime()),
        nodeRecords: [...nodeRecordsById.values()],
        logs: executionLogs,
        error: message,
      })
      await this.repository.updateWorkflowRunState(workflowId, 'failed', failedAt.toISOString())
      return { status: 'failed' as const, execution: updated }
    } finally {
      stopHeartbeat()
      activeWorkflowRuns.delete(workflowId)
      activeWorkflowAbortControllers.delete(workflowId)
    }
  }

  async clearAssetReferences(assetIds: string[]) {
    return new WorkflowAssetReferenceCleaner(this.repository).clearAssetReferences(assetIds)
  }

  async execute(id: string, input: ExecuteWorkflowRequest): Promise<WorkflowRunResponse | null> {
    const validatedInput = executeWorkflowRequestSchema.parse(input)
    if (activeWorkflowRuns.has(id)) throw new WorkflowAlreadyRunningError()
    activeWorkflowRuns.add(id)
    const abortController = new AbortController()
    activeWorkflowAbortControllers.set(id, abortController)

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

      if (validatedInput.retryOfExecutionId) {
        const previousExecution = await this.repository.findExecutionById(
          validatedInput.retryOfExecutionId,
        )
        const previousWorkflowId = previousExecution
          ? typeof previousExecution.workflow === 'string'
            ? previousExecution.workflow
            : previousExecution.workflow?.id
          : undefined
        const failedNode = previousExecution?.nodeRecords.find(
          (record) => record.nodeId === validatedInput.targetNodeId,
        )
        if (
          !previousExecution ||
          previousWorkflowId !== id ||
          !failedNode ||
          !['failed', 'cancelled', 'interrupted'].includes(failedNode.status)
        ) {
          throw new WorkflowValidationError(
            'The selected execution cannot be retried for this node.',
          )
        }
      }

      snapshot = cloneValue(workflow.definition)
      const targetGroup = validatedInput.groupId
        ? snapshot.groups?.find((group) => group.id === validatedInput.groupId)
        : undefined
      if (validatedInput.groupId && !targetGroup) {
        throw new WorkflowValidationError('The selected group no longer exists.')
      }
      try {
        validateWorkflowDefinition(snapshot, validatedInput.targetNodeId, targetGroup?.nodeIds)
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
        ...(validatedInput.retryOfExecutionId
          ? { retryOf: validatedInput.retryOfExecutionId }
          : {}),
        status: 'running',
        scope: validatedInput.targetNodeId
          ? `node:${validatedInput.targetNodeId}:with-dependencies`
          : targetGroup
            ? `group:${targetGroup.id}`
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
      const onProviderTask = async (
        nodeId: string,
        task: { provider: string; model: string; taskId: string },
      ) => {
        const existing = nodeRecordsById.get(nodeId)
        await onNodeRecord({
          ...(existing ?? { nodeId, status: 'running' as const }),
          providerTask: { ...task, lastPolledAt: this.now().toISOString() },
        })
      }

      let runResult: EngineResult
      try {
        runResult = await this.runWorkflow(snapshot, validatedInput.targetNodeId, {
          signal: abortController.signal,
          onProviderTask,
          ...(targetGroup ? { targetNodeIds: targetGroup.nodeIds } : {}),
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
      activeWorkflowAbortControllers.delete(id)
    }
  }
}

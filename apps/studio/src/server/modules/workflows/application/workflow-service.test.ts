import { describe, expect, it, vi } from 'vitest'
import type {
  ExecutionDocument,
  NodeExecutionRecord,
  WorkflowDefinition,
  WorkflowDocument,
  WorkflowRunResult,
} from '@znith/contracts'
import type {
  ExecutionCreateRecord,
  ExecutionUpdateRecord,
  WorkflowCreateRecord,
  WorkflowRepository,
  WorkflowUpdateRecord,
} from '../domain/workflow-repository'
import { WorkflowService, type WorkflowRunner } from './workflow-service'

function createWorkflowDocument(
  definition: WorkflowDefinition = { version: 1, nodes: [], edges: [] },
): WorkflowDocument {
  return {
    id: 'workflow-string-id',
    name: 'Existing workflow',
    description: '',
    category: 'custom',
    status: 'idle',
    definition,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
  }
}

class MemoryWorkflowRepository implements WorkflowRepository {
  readonly workflows = new Map<string, WorkflowDocument>()
  readonly executions = new Map<string, ExecutionDocument>()
  workflowWrites: WorkflowUpdateRecord[] = []
  executionWrites: ExecutionUpdateRecord[] = []
  executionCreates: ExecutionCreateRecord[] = []

  constructor(initialWorkflow?: WorkflowDocument) {
    if (initialWorkflow) this.workflows.set(initialWorkflow.id, initialWorkflow)
  }

  async listWorkflows() {
    return [...this.workflows.values()]
  }

  async findWorkflowById(id: string) {
    return this.workflows.get(id) ?? null
  }

  async createWorkflow(data: WorkflowCreateRecord) {
    const workflow: WorkflowDocument = {
      ...data,
      id: 'created-workflow-id',
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z',
    }
    this.workflows.set(workflow.id, workflow)
    return workflow
  }

  async updateWorkflow(id: string, data: WorkflowUpdateRecord) {
    const current = this.workflows.get(id)
    if (!current) throw new Error('Workflow does not exist.')
    const updated = { ...current, ...data }
    this.workflows.set(id, updated)
    this.workflowWrites.push(data)
    return updated
  }

  async deleteWorkflow(id: string) {
    this.workflows.delete(id)
  }

  async listExecutions(workflowId: string) {
    return [...this.executions.values()].filter((execution) => execution.workflow === workflowId)
  }

  async createExecution(data: ExecutionCreateRecord) {
    const execution: ExecutionDocument = {
      ...data,
      id: `execution-${this.executionCreates.length + 1}`,
      createdAt: data.startedAt,
      updatedAt: data.startedAt,
    }
    this.executionCreates.push(data)
    this.executions.set(execution.id, execution)
    return execution
  }

  async updateExecution(id: string, data: ExecutionUpdateRecord) {
    const current = this.executions.get(id)
    if (!current) throw new Error('Execution does not exist.')
    const updated = { ...current, ...data }
    this.executions.set(id, updated)
    this.executionWrites.push(data)
    return updated
  }

  async claimWorkflowRun(id: string, lastExecutionAt: string, staleBefore: string) {
    const current = this.workflows.get(id)
    if (!current) return null
    const stale =
      current.status === 'running' &&
      current.lastExecutionAt != null &&
      current.lastExecutionAt < staleBefore
    if (current.status === 'running' && !stale) return null
    const updated = { ...current, status: 'running' as const, lastExecutionAt }
    this.workflows.set(id, updated)
    this.workflowWrites.push({ status: 'running', lastExecutionAt })
    return stale ? ('reclaimed' as const) : ('claimed' as const)
  }

  async updateWorkflowRunState(
    id: string,
    status: WorkflowDocument['status'],
    lastExecutionAt: string,
  ) {
    this.workflowWrites.push({ status, lastExecutionAt })
    await this.updateWorkflow(id, { status, lastExecutionAt })
  }
}

const successfulRun: WorkflowRunResult = { status: 'succeeded', records: [], logs: [] }

describe('WorkflowService', () => {
  it('creates a workflow from a template and applies allowed overrides', async () => {
    const repository = new MemoryWorkflowRepository()
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
    )

    const workflow = await service.createWorkflow({
      templateId: 'story',
      name: 'Launch story',
    })

    expect(workflow.name).toBe('Launch story')
    expect(workflow.category).toBe('story')
    expect(workflow.definition.nodes).toHaveLength(5)
    expect(workflow.status).toBe('idle')
  })

  it('rejects invalid updates before writing to the repository', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflowDocument())
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
    )

    await expect(
      service.updateWorkflow('workflow-string-id', { owner: 'unknown-field' }),
    ).rejects.toThrow()
    expect(repository.workflowWrites).toEqual([])
  })

  it('snapshots a workflow and persists execution status and timing', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'prompt',
          type: 'input.prompt',
          name: 'Prompt',
          position: { x: 0, y: 0 },
          config: { value: 'original' },
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(definition))
    const runWorkflow = vi.fn(async () => successfulRun)
    const timestamps = [new Date('2026-11-05T00:00:00.000Z'), new Date('2026-11-05T00:00:00.250Z')]
    const service = new WorkflowService(repository, runWorkflow, () => timestamps.shift()!)

    const response = await service.execute('workflow-string-id', {})

    expect(response).toEqual({ executionId: 'execution-1', ...successfulRun })
    expect(repository.executionCreates[0].snapshot).toEqual(definition)
    expect(repository.executionWrites[0]).toMatchObject({
      status: 'succeeded',
      durationMs: 250,
      completedAt: '2026-11-05T00:00:00.250Z',
    })
    expect(repository.workflowWrites.slice(-1)[0]).toMatchObject({
      status: 'succeeded',
      lastExecutionAt: '2026-11-05T00:00:00.250Z',
    })
  })

  it('rejects concurrent execution requests before creating a second execution', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflowDocument())
    let finishRun: (() => void) | undefined
    const runWorkflow = vi.fn(
      () =>
        new Promise<WorkflowRunResult>((resolve) => {
          finishRun = () => resolve(successfulRun)
        }),
    )
    const service = new WorkflowService(repository, runWorkflow)

    const firstRun = service.execute('workflow-string-id', {})
    await vi.waitFor(() => expect(runWorkflow).toHaveBeenCalledOnce())
    await expect(service.execute('workflow-string-id', {})).rejects.toThrow(
      'This workflow is already running.',
    )
    finishRun?.()
    await expect(firstRun).resolves.toMatchObject({ status: 'succeeded' })
    expect(repository.executionCreates).toHaveLength(1)
  })

  it('validates the graph before claiming a run or creating an execution', async () => {
    const duplicateNodeDefinition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'duplicate',
          type: 'input.prompt',
          name: 'Prompt one',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'duplicate',
          type: 'input.text',
          name: 'Prompt two',
          position: { x: 0, y: 100 },
          config: {},
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(duplicateNodeDefinition))
    const runWorkflow = vi.fn(async () => successfulRun)
    const service = new WorkflowService(repository, runWorkflow)

    await expect(service.execute('workflow-string-id', {})).rejects.toThrow(
      'Duplicate node identifier',
    )
    expect(repository.executionCreates).toEqual([])
    expect(repository.workflows.get('workflow-string-id')?.status).toBe('idle')
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('marks a stale execution interrupted before reclaiming the workflow', async () => {
    const workflow = createWorkflowDocument()
    workflow.status = 'running'
    workflow.lastExecutionAt = '2026-11-05T00:00:00.000Z'
    const repository = new MemoryWorkflowRepository(workflow)
    const staleExecution: ExecutionDocument = {
      id: 'execution-stale',
      workflow: workflow.id,
      status: 'running',
      scope: 'workflow',
      startedAt: '2026-11-05T00:00:00.000Z',
      snapshot: workflow.definition,
      nodeRecords: [],
      logs: [],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:00.000Z',
    }
    repository.executions.set(staleExecution.id, staleExecution)
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
      () => new Date('2026-11-05T01:00:00.000Z'),
    )

    const response = await service.execute(workflow.id, {})

    expect(response?.status).toBe('succeeded')
    expect(repository.executions.get(staleExecution.id)).toMatchObject({
      status: 'interrupted',
      error: 'Execution was interrupted because its server process stopped.',
    })
    expect(repository.executionCreates).toHaveLength(1)
  })

  it('persists node progress records as nodes start and complete', async () => {
    const startedRecord: NodeExecutionRecord = {
      nodeId: 'prompt',
      status: 'running',
      startedAt: '2026-11-05T00:00:00.050Z',
    }
    const completedRecord: NodeExecutionRecord = {
      nodeId: 'prompt',
      status: 'succeeded',
      startedAt: startedRecord.startedAt,
      completedAt: '2026-11-05T00:00:00.100Z',
      durationMs: 50,
      outputs: { text: { type: 'text', value: 'Generated output' } },
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument())
    const runWorkflow: WorkflowRunner = async (_definition, _targetNodeId, options) => {
      await options?.onNodeRecord?.(startedRecord)
      await options?.onNodeRecord?.(completedRecord)
      return { status: 'succeeded', records: [completedRecord], logs: [] }
    }
    const service = new WorkflowService(repository, runWorkflow)

    await service.execute('workflow-string-id', {})

    expect(repository.executionWrites.map((write) => write.nodeRecords?.[0]?.status)).toEqual([
      'running',
      'succeeded',
      'succeeded',
    ])
    expect(repository.executionWrites[1].nodeRecords?.[0].outputs?.text.value).toBe(
      'Generated output',
    )
  })

  it('does not run a missing workflow', async () => {
    const runWorkflow = vi.fn(async () => successfulRun)
    const service = new WorkflowService(new MemoryWorkflowRepository(), runWorkflow)

    await expect(service.execute('missing', {})).resolves.toBeNull()
    expect(runWorkflow).not.toHaveBeenCalled()
  })
})

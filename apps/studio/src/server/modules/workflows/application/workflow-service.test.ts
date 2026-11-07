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

  async listAllWorkflows() {
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

  async findExecutionById(id: string) {
    return this.executions.get(id) ?? null
  }

  async listAllExecutions() {
    return [...this.executions.values()]
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
  it('resets media inputs and saved outputs across workflows and execution history', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'image-input',
          type: 'input.image',
          name: 'Image',
          position: { x: 0, y: 0 },
          config: {
            assetId: 'asset-deleted',
            url: '/api/media/file/deleted.png',
            fileName: 'deleted.png',
            mimeType: 'image/png',
            imageWidth: 500,
            imageHeight: 400,
          },
        },
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate',
          position: { x: 300, y: 0 },
          config: {
            provider: 'openai',
            model: 'gpt-image-1',
            selectedOutput: {
              type: 'image',
              assetId: 'asset-deleted',
              value: { assetId: 'asset-deleted', url: '/api/media/file/deleted.png' },
            },
          },
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(definition))
    repository.executions.set('execution-1', {
      id: 'execution-1',
      workflow: 'workflow-string-id',
      status: 'succeeded',
      scope: 'workflow',
      startedAt: '2026-11-06T00:00:00.000Z',
      snapshot: definition,
      nodeRecords: [
        {
          nodeId: 'image-input',
          status: 'succeeded',
          outputs: {
            image: {
              type: 'image',
              assetId: 'asset-deleted',
              value: { assetId: 'asset-deleted', url: '/api/media/file/deleted.png' },
            },
          },
        },
        {
          nodeId: 'generate',
          status: 'succeeded',
          outputs: {
            image: {
              type: 'image',
              assetId: 'asset-keep',
              value: { assetId: 'asset-keep', url: '/api/media/file/keep.png' },
            },
          },
        },
      ],
      logs: [],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    })
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
    )

    await service.clearAssetReferences(['asset-deleted'])

    const savedWorkflow = repository.workflows.get('workflow-string-id')!
    expect(savedWorkflow.definition.nodes[0].config).toMatchObject({
      assetId: '',
      url: '',
      fileName: '',
      mimeType: 'image/png',
    })
    expect(savedWorkflow.definition.nodes[0].config.imageWidth).toBeUndefined()
    expect(savedWorkflow.definition.nodes[1].config.selectedOutput).toBeNull()
    expect(savedWorkflow.definition.nodes[1].config.outputRevision).toBeTruthy()

    const savedExecution = repository.executions.get('execution-1')!
    expect(savedExecution.snapshot.nodes[0].config.assetId).toBe('')
    expect(savedExecution.nodeRecords[0].outputs).toEqual({})
    expect(savedExecution.nodeRecords[1].outputs?.image?.assetId).toBe('asset-keep')
    expect(repository.workflowWrites).toHaveLength(1)
    expect(repository.executionWrites).toHaveLength(1)
  })

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

  it('links a node retry to its failed execution after validating ownership and node status', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate',
          position: { x: 0, y: 0 },
          config: { prompt: 'A blue ceramic vase' },
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(definition))
    repository.executions.set('execution-failed', {
      id: 'execution-failed',
      workflow: 'workflow-string-id',
      status: 'failed',
      scope: 'node:generate:with-dependencies',
      startedAt: '2026-11-05T00:00:00.000Z',
      snapshot: definition,
      nodeRecords: [{ nodeId: 'generate', status: 'failed', error: 'Provider unavailable.' }],
      logs: [],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:01.000Z',
    })
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
    )

    await service.execute('workflow-string-id', {
      targetNodeId: 'generate',
      retryOfExecutionId: 'execution-failed',
    })

    expect(repository.executionCreates[0].retryOf).toBe('execution-failed')
  })

  it('rejects retry links to another workflow or a successful node', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate',
          position: { x: 0, y: 0 },
          config: { prompt: 'A blue ceramic vase' },
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(definition))
    repository.executions.set('execution-other-workflow', {
      id: 'execution-other-workflow',
      workflow: 'someone-elses-workflow',
      status: 'failed',
      scope: 'node:generate:with-dependencies',
      startedAt: '2026-11-05T00:00:00.000Z',
      snapshot: definition,
      nodeRecords: [{ nodeId: 'generate', status: 'failed' }],
      logs: [],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:01.000Z',
    })
    repository.executions.set('execution-succeeded', {
      id: 'execution-succeeded',
      workflow: 'workflow-string-id',
      status: 'succeeded',
      scope: 'node:generate:with-dependencies',
      startedAt: '2026-11-05T00:00:00.000Z',
      snapshot: definition,
      nodeRecords: [{ nodeId: 'generate', status: 'succeeded' }],
      logs: [],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:01.000Z',
    })
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
    )

    await expect(
      service.execute('workflow-string-id', {
        targetNodeId: 'generate',
        retryOfExecutionId: 'execution-other-workflow',
      }),
    ).rejects.toThrow('The selected execution cannot be retried for this node.')
    await expect(
      service.execute('workflow-string-id', {
        targetNodeId: 'generate',
        retryOfExecutionId: 'execution-succeeded',
      }),
    ).rejects.toThrow('The selected execution cannot be retried for this node.')
    expect(repository.executionCreates).toEqual([])
  })

  it('retries saving an execution output idempotently without changing its input snapshot', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate',
          position: { x: 0, y: 0 },
          config: { prompt: 'A blue ceramic vase' },
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(definition))
    const generatedOutputs = {
      image: { type: 'image' as const, value: { url: 'https://media.example/result.png' } },
    }
    repository.executions.set('execution-1', {
      id: 'execution-1',
      workflow: 'workflow-string-id',
      status: 'succeeded',
      scope: 'workflow',
      startedAt: '2026-11-05T00:00:00.000Z',
      snapshot: definition,
      nodeRecords: [{ nodeId: 'generate', status: 'succeeded', outputs: generatedOutputs }],
      logs: [],
      createdAt: '2026-11-05T00:00:00.000Z',
      updatedAt: '2026-11-05T00:00:01.000Z',
    })
    const persistedOutputs = {
      image: {
        type: 'image' as const,
        value: { url: '/media/generated.png', assetId: 'asset-1', filename: 'generated.png' },
        assetId: 'asset-1',
        metadata: { assetId: 'asset-1', savedToAssets: true },
      },
    }
    const mediaPersister = {
      persist: vi.fn(async () => ({ outputs: persistedOutputs })),
    }
    const service = new WorkflowService(
      repository,
      vi.fn(async () => successfulRun),
      undefined,
      mediaPersister as unknown as import('./workflow-media-persister').WorkflowMediaPersister,
    )

    const result = await service.saveNodeOutputToAssets('workflow-string-id', 'generate')

    expect(mediaPersister.persist).toHaveBeenCalledOnce()
    expect(repository.executionWrites[0].nodeRecords?.[0].outputs).toEqual(persistedOutputs)
    expect(repository.executions.get('execution-1')?.snapshot).toEqual(definition)
    expect(result).toMatchObject({ executionId: 'execution-1', nodeId: 'generate' })
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

  it('persists node logs while the execution is still running', async () => {
    const startedRecord: NodeExecutionRecord = {
      nodeId: 'prompt',
      status: 'running',
      startedAt: '2026-11-05T00:00:00.050Z',
    }
    const log = {
      at: '2026-11-05T00:00:00.050Z',
      level: 'info' as const,
      nodeId: 'prompt',
      message: 'Prompt started',
    }
    let finishRun: (() => void) | undefined
    const runWorkflow: WorkflowRunner = async (_definition, _targetNodeId, options) => {
      await options?.onNodeRecord?.(startedRecord)
      await options?.onExecutionLog?.(log)
      await new Promise<void>((resolve) => {
        finishRun = resolve
      })
      return { status: 'succeeded', records: [startedRecord], logs: [log] }
    }
    const repository = new MemoryWorkflowRepository(
      createWorkflowDocument({
        version: 1,
        nodes: [
          {
            id: 'prompt',
            type: 'input.prompt',
            name: 'Prompt',
            position: { x: 0, y: 0 },
            config: { value: 'Hello' },
          },
        ],
        edges: [],
      }),
    )
    const service = new WorkflowService(repository, runWorkflow)
    const executionPromise = service.execute('workflow-string-id', {})

    await vi.waitFor(() => {
      const execution = [...repository.executions.values()][0]
      expect(execution?.logs).toEqual([log])
      expect(execution?.status).toBe('running')
    })
    const { executions } = await service.getWorkflow('workflow-string-id')
    expect(executions[0].nodeRecords).toEqual([startedRecord])
    expect(executions[0].logs).toEqual([log])

    finishRun?.()
    await expect(executionPromise).resolves.toMatchObject({ status: 'succeeded' })
  })

  it('does not run a missing workflow', async () => {
    const runWorkflow = vi.fn(async () => successfulRun)
    const service = new WorkflowService(new MemoryWorkflowRepository(), runWorkflow)

    await expect(service.execute('missing', {})).resolves.toBeNull()
    expect(runWorkflow).not.toHaveBeenCalled()
  })

  it('cancels an active execution after confirming workflow access', async () => {
    const repository = new MemoryWorkflowRepository(createWorkflowDocument())
    let runSignal: AbortSignal | undefined
    const runWorkflow: WorkflowRunner = (_definition, _target, options) =>
      new Promise((resolve) => {
        runSignal = options?.signal
        runSignal?.addEventListener(
          'abort',
          () => resolve({ status: 'cancelled', records: [], logs: [] }),
          { once: true },
        )
      })
    const service = new WorkflowService(repository, runWorkflow)
    const executionPromise = service.execute('workflow-string-id', {})

    await vi.waitFor(() => expect(runSignal).toBeDefined())
    await expect(service.cancel('workflow-string-id')).resolves.toBe(true)
    await expect(executionPromise).resolves.toMatchObject({ status: 'cancelled' })
    expect(repository.executionWrites.at(-1)?.status).toBe('cancelled')
    await expect(service.cancel('missing')).resolves.toBe(false)
  })

  it('checks a saved video task and resumes its original group execution without resubmitting it', async () => {
    const snapshot: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'video',
          type: 'ai.generate-video',
          name: 'Generate video',
          position: { x: 0, y: 0 },
          config: { provider: 'replicate', model: 'bytedance/seedance-2.5', prompt: 'A sunrise' },
        },
        {
          id: 'save',
          type: 'output.save-video',
          name: 'Save video',
          position: { x: 300, y: 0 },
          config: { fileName: 'sunrise.mp4' },
        },
        {
          id: 'unrelated',
          type: 'input.text',
          name: 'Unrelated',
          position: { x: 0, y: 300 },
          config: { value: 'Keep out of scope' },
        },
      ],
      edges: [
        {
          id: 'video-save',
          source: 'video',
          sourceHandle: 'video',
          target: 'save',
          targetHandle: 'video',
        },
      ],
      groups: [
        {
          id: 'group-1',
          name: 'Delivery',
          nodeIds: ['save'],
          position: { x: 0, y: 0 },
          width: 640,
          height: 320,
        },
      ],
    }
    const repository = new MemoryWorkflowRepository({
      ...createWorkflowDocument(snapshot),
      status: 'running',
      lastExecutionAt: '2026-11-07T10:00:00.000Z',
    })
    repository.executions.set('execution-1', {
      id: 'execution-1',
      workflow: 'workflow-string-id',
      status: 'running',
      scope: 'group:group-1',
      startedAt: '2026-11-07T10:00:00.000Z',
      snapshot,
      nodeRecords: [
        {
          nodeId: 'video',
          status: 'running',
          startedAt: '2026-11-07T10:00:01.000Z',
          providerTask: {
            provider: 'replicate',
            model: 'bytedance/seedance-2.5',
            taskId: 'provider-task-1',
          },
        },
      ],
      logs: [],
      createdAt: '2026-11-07T10:00:00.000Z',
      updatedAt: '2026-11-07T10:00:01.000Z',
    })
    const resumedRunner = vi.fn(
      async (_definition: WorkflowDefinition, _targetNodeId: string | undefined, options) => ({
        status: 'succeeded' as const,
        records: options?.initialRecords ?? [],
        logs: [],
      }),
    )
    const mediaPersister = {
      persist: vi.fn(async () => ({
        outputs: {
          video: {
            type: 'video' as const,
            value: { url: '/api/media/file/sunrise.mp4' },
            assetId: 'asset-video-1',
          },
        },
      })),
    }
    const service = new WorkflowService(
      repository,
      resumedRunner,
      () => new Date('2026-11-07T12:00:00.000Z'),
      mediaPersister as unknown as import('./workflow-media-persister').WorkflowMediaPersister,
      vi.fn(async () => ({
        status: 'succeeded' as const,
        url: 'https://provider.example/sunrise.mp4',
      })),
    )

    const result = await service.refreshVideoTask('execution-1', 'workflow-string-id')

    expect(result.status).toBe('resumed')
    expect(repository.executionCreates).toHaveLength(0)
    expect(mediaPersister.persist).toHaveBeenCalledOnce()
    expect(resumedRunner).toHaveBeenCalledOnce()
    expect(resumedRunner.mock.calls[0][2]).toMatchObject({ targetNodeIds: ['save'] })
    expect(resumedRunner.mock.calls[0][2]?.initialRecords).toContainEqual(
      expect.objectContaining({
        nodeId: 'video',
        status: 'succeeded',
        outputs: { video: expect.objectContaining({ assetId: 'asset-video-1' }) },
      }),
    )
    expect(repository.executions.get('execution-1')).toMatchObject({ status: 'succeeded' })
    expect(
      repository.executions.get('execution-1')?.nodeRecords.map((record) => record.nodeId),
    ).toEqual(expect.arrayContaining(['video']))
  })

  it('records a pending status poll without starting another execution', async () => {
    const snapshot: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'video',
          type: 'ai.generate-video',
          name: 'Video',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    }
    const repository = new MemoryWorkflowRepository(createWorkflowDocument(snapshot))
    repository.executions.set('execution-1', {
      id: 'execution-1',
      workflow: 'workflow-string-id',
      status: 'interrupted',
      scope: 'workflow',
      startedAt: '2026-11-07T10:00:00.000Z',
      snapshot,
      nodeRecords: [
        {
          nodeId: 'video',
          status: 'running',
          providerTask: { provider: 'replicate', model: 'seedance', taskId: 'pending-task' },
        },
      ],
      logs: [],
      createdAt: '2026-11-07T10:00:00.000Z',
      updatedAt: '2026-11-07T10:00:01.000Z',
    })
    const runner = vi.fn(async () => successfulRun)
    const service = new WorkflowService(
      repository,
      runner,
      () => new Date('2026-11-07T12:00:00.000Z'),
      undefined,
      vi.fn(async () => ({ status: 'pending' as const })),
    )

    const result = await service.refreshVideoTask('execution-1')

    expect(result.status).toBe('pending')
    expect(runner).not.toHaveBeenCalled()
    expect(repository.executionCreates).toHaveLength(0)
    expect(
      repository.executions.get('execution-1')?.nodeRecords[0].providerTask?.lastPolledAt,
    ).toBe('2026-11-07T12:00:00.000Z')
  })
})

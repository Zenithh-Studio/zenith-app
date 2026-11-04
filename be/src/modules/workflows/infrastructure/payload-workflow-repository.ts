import type { ExecutionDocument, WorkflowDocument } from '@znith/contracts'
import type {
  ExecutionCreateRecord,
  ExecutionUpdateRecord,
  WorkflowCreateRecord,
  WorkflowRepository,
  WorkflowUpdateRecord,
} from '../domain/workflow-repository'

interface PayloadQueryOptions {
  collection: 'workflows' | 'executions'
  overrideAccess: false
  depth: 0
  limit?: number
  sort?: string
  where?: Record<string, unknown>
}

interface PayloadMutationOptions {
  collection: 'workflows' | 'executions'
  overrideAccess: false
  data?: Record<string, unknown>
  id?: string
}

export interface PayloadLocalApi {
  find(options: PayloadQueryOptions): Promise<{ docs: unknown[] }>
  findByID(options: {
    collection: 'workflows'
    id: string
    overrideAccess: false
    depth: 0
  }): Promise<unknown>
  create(options: PayloadMutationOptions): Promise<unknown>
  update(options: PayloadMutationOptions & { id: string }): Promise<unknown>
  delete(options: { collection: 'workflows'; id: string; overrideAccess: false }): Promise<unknown>
}

function asDocument<T>(value: unknown): T {
  if (!value || typeof value !== 'object') {
    throw new Error('Payload returned an invalid document.')
  }
  return value as T
}

export class PayloadWorkflowRepository implements WorkflowRepository {
  constructor(private readonly payloadClient: PayloadLocalApi) {}

  async listWorkflows(search?: string) {
    const normalizedSearch = search?.trim()
    const { docs } = await this.payloadClient.find({
      collection: 'workflows',
      overrideAccess: false,
      depth: 0,
      limit: 100,
      sort: '-updatedAt',
      ...(normalizedSearch
        ? {
            where: {
              or: [
                { name: { contains: normalizedSearch } },
                { description: { contains: normalizedSearch } },
              ],
            },
          }
        : {}),
    })
    return docs.map((document) => asDocument<WorkflowDocument>(document))
  }

  async findWorkflowById(id: string) {
    try {
      const document = await this.payloadClient.findByID({
        collection: 'workflows',
        id,
        overrideAccess: false,
        depth: 0,
      })
      return asDocument<WorkflowDocument>(document)
    } catch {
      return null
    }
  }

  async createWorkflow(data: WorkflowCreateRecord) {
    const document = await this.payloadClient.create({
      collection: 'workflows',
      overrideAccess: false,
      data: data as unknown as Record<string, unknown>,
    })
    return asDocument<WorkflowDocument>(document)
  }

  async updateWorkflow(id: string, data: WorkflowUpdateRecord) {
    const document = await this.payloadClient.update({
      collection: 'workflows',
      id,
      overrideAccess: false,
      data: data as Record<string, unknown>,
    })
    return asDocument<WorkflowDocument>(document)
  }

  async deleteWorkflow(id: string) {
    await this.payloadClient.delete({ collection: 'workflows', id, overrideAccess: false })
  }

  async listExecutions(workflowId: string, limit: number) {
    const { docs } = await this.payloadClient.find({
      collection: 'executions',
      overrideAccess: false,
      depth: 0,
      limit,
      sort: '-startedAt',
      where: { workflow: { equals: workflowId } },
    })
    return docs.map((document) => asDocument<ExecutionDocument>(document))
  }

  async createExecution(data: ExecutionCreateRecord) {
    const document = await this.payloadClient.create({
      collection: 'executions',
      overrideAccess: false,
      data: data as unknown as Record<string, unknown>,
    })
    return asDocument<ExecutionDocument>(document)
  }

  async updateExecution(id: string, data: ExecutionUpdateRecord) {
    const document = await this.payloadClient.update({
      collection: 'executions',
      id,
      overrideAccess: false,
      data: data as Record<string, unknown>,
    })
    return asDocument<ExecutionDocument>(document)
  }

  async updateWorkflowRunState(
    id: string,
    status: WorkflowDocument['status'],
    lastExecutionAt: string,
  ) {
    await this.payloadClient.update({
      collection: 'workflows',
      id,
      overrideAccess: false,
      data: { status, lastExecutionAt },
    })
  }
}

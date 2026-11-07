import type { ExecutionDocument, WorkflowDocument } from '@znith/contracts'
import type {
  ExecutionCreateRecord,
  ExecutionUpdateRecord,
  WorkflowCreateRecord,
  WorkflowRepository,
  WorkflowUpdateRecord,
} from '../domain/workflow-repository'
import type { AuthenticatedUser } from 'payload'

type PayloadUserRequest = {
  user?: AuthenticatedUser | null
  context?: Record<string, unknown>
}

interface PayloadQueryOptions {
  collection: 'workflows' | 'executions'
  overrideAccess: false
  depth: 0
  limit?: number
  sort?: string
  page?: number
  where?: Record<string, unknown>
  req?: PayloadUserRequest
}

interface PayloadQueryResult {
  docs: unknown[]
  hasNextPage?: boolean
  nextPage?: number | null
}

interface PayloadMutationOptions {
  collection: 'workflows' | 'executions'
  overrideAccess: false
  data?: Record<string, unknown>
  id?: string
  req?: PayloadUserRequest
}

interface PayloadWorkflowDatabaseApi {
  updateOne(options: {
    collection: 'workflows'
    where: Record<string, unknown>
    data: Record<string, unknown>
    options: { atomic: true }
    req?: PayloadUserRequest
  }): Promise<unknown | null>
}

export interface PayloadLocalApi {
  db: PayloadWorkflowDatabaseApi
  find(options: PayloadQueryOptions): Promise<PayloadQueryResult>
  findByID(options: {
    collection: 'workflows' | 'executions'
    id: string
    overrideAccess: false
    depth: 0
    req?: PayloadUserRequest
  }): Promise<unknown>
  create(options: PayloadMutationOptions): Promise<unknown>
  update(options: PayloadMutationOptions & { id: string }): Promise<unknown>
  delete(options: {
    collection: 'workflows'
    id: string
    overrideAccess: false
    req?: PayloadUserRequest
  }): Promise<unknown>
}

function asDocument<T>(value: unknown): T {
  if (!value || typeof value !== 'object') {
    throw new Error('Payload returned an invalid document.')
  }
  return value as T
}

export class PayloadWorkflowRepository implements WorkflowRepository {
  constructor(
    private readonly payloadClient: PayloadLocalApi,
    private readonly user: AuthenticatedUser,
  ) {}

  private userRequest(context?: Record<string, unknown>): PayloadUserRequest {
    return { user: this.user, ...(context ? { context } : {}) }
  }

  async listWorkflows(search?: string) {
    const normalizedSearch = search?.trim()
    const { docs } = await this.payloadClient.find({
      collection: 'workflows',
      overrideAccess: false,
      depth: 0,
      limit: 100,
      sort: '-updatedAt',
      req: this.userRequest(),
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

  async listAllWorkflows() {
    return this.findAll('workflows', '-updatedAt').then((docs) =>
      docs.map((document) => asDocument<WorkflowDocument>(document)),
    )
  }

  async listAllExecutions() {
    return this.findAll('executions', '-startedAt').then((docs) =>
      docs.map((document) => asDocument<ExecutionDocument>(document)),
    )
  }

  private async findAll(collection: 'workflows' | 'executions', sort: string) {
    const documents: unknown[] = []
    let page = 1
    while (true) {
      const result = await this.payloadClient.find({
        collection,
        overrideAccess: false,
        depth: 0,
        limit: 100,
        sort,
        page,
        req: this.userRequest(),
      })
      documents.push(...result.docs)
      if (!result.hasNextPage || !result.nextPage) break
      page = result.nextPage
    }
    return documents
  }

  async findWorkflowById(id: string) {
    try {
      const document = await this.payloadClient.findByID({
        collection: 'workflows',
        id,
        overrideAccess: false,
        depth: 0,
        req: this.userRequest(),
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
      data: { ...data, owner: this.user.id } as unknown as Record<string, unknown>,
      req: this.userRequest({ workflowRuntime: true }),
    })
    return asDocument<WorkflowDocument>(document)
  }

  async updateWorkflow(id: string, data: WorkflowUpdateRecord) {
    const document = await this.payloadClient.update({
      collection: 'workflows',
      id,
      overrideAccess: false,
      data: data as Record<string, unknown>,
      req: this.userRequest({ workflowRuntime: true }),
    })
    return asDocument<WorkflowDocument>(document)
  }

  async deleteWorkflow(id: string) {
    await this.payloadClient.delete({
      collection: 'workflows',
      id,
      overrideAccess: false,
      req: this.userRequest({ workflowRuntime: true }),
    })
  }

  async listExecutions(workflowId: string, limit: number) {
    const { docs } = await this.payloadClient.find({
      collection: 'executions',
      overrideAccess: false,
      depth: 0,
      limit,
      sort: '-startedAt',
      where: { workflow: { equals: workflowId } },
      req: this.userRequest(),
    })
    return docs.map((document) => asDocument<ExecutionDocument>(document))
  }

  async findExecutionById(id: string) {
    try {
      const document = await this.payloadClient.findByID({
        collection: 'executions',
        id,
        overrideAccess: false,
        depth: 0,
        req: this.userRequest(),
      })
      return asDocument<ExecutionDocument>(document)
    } catch {
      return null
    }
  }

  async createExecution(data: ExecutionCreateRecord) {
    const document = await this.payloadClient.create({
      collection: 'executions',
      overrideAccess: false,
      data: { ...data, owner: this.user.id } as unknown as Record<string, unknown>,
      req: this.userRequest({ workflowRuntime: true }),
    })
    return asDocument<ExecutionDocument>(document)
  }

  async updateExecution(id: string, data: ExecutionUpdateRecord) {
    const document = await this.payloadClient.update({
      collection: 'executions',
      id,
      overrideAccess: false,
      data: data as Record<string, unknown>,
      req: this.userRequest({ workflowRuntime: true }),
    })
    return asDocument<ExecutionDocument>(document)
  }

  async claimWorkflowRun(id: string, lastExecutionAt: string, staleBefore: string) {
    const data = { status: 'running', lastExecutionAt, updatedAt: lastExecutionAt }
    const claimed = await this.payloadClient.db.updateOne({
      collection: 'workflows',
      where: {
        and: [{ id: { equals: id } }, { status: { not_equals: 'running' } }],
      },
      data,
      options: { atomic: true },
      req: this.userRequest({ workflowRuntime: true }),
    })
    if (claimed) return 'claimed' as const

    const reclaimed = await this.payloadClient.db.updateOne({
      collection: 'workflows',
      where: {
        and: [
          { id: { equals: id } },
          { status: { equals: 'running' } },
          { lastExecutionAt: { less_than: staleBefore } },
        ],
      },
      data,
      options: { atomic: true },
      req: this.userRequest({ workflowRuntime: true }),
    })
    return reclaimed ? ('reclaimed' as const) : null
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
      req: this.userRequest({ workflowRuntime: true }),
    })
  }
}

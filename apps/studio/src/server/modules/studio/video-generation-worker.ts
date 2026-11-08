import 'server-only'

import type { AuthenticatedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload'
import { getWorkflowService } from '@/lib/backend-services'
import { isStudioGenerationRunActive, refreshVideoGeneration } from './refresh-video-generation'

const pollIntervalMs = 15_000
const batchSize = 25

type GenerationRecord = {
  id: string
  owner?: string | { id?: string | number } | null
  status?: string
  updatedAt?: string
  nodeRecords?: Array<{
    status?: string
    providerTask?: { taskId?: string }
  }>
}

type UserRecord = Record<string, unknown> & { id: string | number }

type WorkerPayload = {
  find(options: {
    collection: 'studio-generations' | 'executions'
    overrideAccess: true
    depth: 1
    limit: number
    page: number
    sort: string
    where: Record<string, unknown>
  }): Promise<{
    docs: GenerationRecord[]
    hasNextPage?: boolean
    nextPage?: number | null
  }>
  findByID(options: {
    collection: 'users'
    id: string
    overrideAccess: true
    depth: 0
  }): Promise<UserRecord>
  update(options: {
    collection: 'studio-generations'
    id: string
    overrideAccess: true
    data: Record<string, unknown>
  }): Promise<unknown>
}

type WorkerGlobal = typeof globalThis & {
  __znithVideoTaskWorker?: ReturnType<typeof setInterval>
}

async function pollPendingVideoTasks() {
  const payload = (await getPayloadClient()) as unknown as WorkerPayload
  const query = {
    collection: 'studio-generations' as const,
    overrideAccess: true as const,
    depth: 1 as const,
    limit: batchSize,
    page: 1,
    sort: 'lastPolledAt',
  }
  const findAll = async (where: Record<string, unknown>) => {
    const docs: GenerationRecord[] = []
    let page = 1
    while (true) {
      const result = await payload.find({ ...query, page, where })
      docs.push(...result.docs)
      if (!result.hasNextPage || !result.nextPage) return docs
      page = result.nextPage
    }
  }
  const [pendingTasks, unstartedRuns] = await Promise.all([
    findAll({
      and: [
        { modality: { equals: 'video' } },
        { status: { in: ['pending', 'interrupted', 'running'] } },
        { providerTaskId: { exists: true } },
      ],
    }),
    findAll({
      and: [
        { modality: { equals: 'video' } },
        { status: { equals: 'running' } },
        { providerTaskId: { exists: false } },
      ],
    }),
  ])

  for (const generation of unstartedRuns) {
    if (isStudioGenerationRunActive(String(generation.id))) continue
    await payload
      .update({
        collection: 'studio-generations',
        id: String(generation.id),
        overrideAccess: true,
        data: {
          status: 'interrupted',
          errorCode: 'PROVIDER_TASK_NOT_CREATED',
          error:
            'The server restarted before the provider returned a task ID. Retry with saved settings.',
          lastPolledAt: new Date().toISOString(),
        },
      })
      .catch(() => undefined)
  }

  for (let index = 0; index < pendingTasks.length; index += 5) {
    const batch = pendingTasks.slice(index, index + 5)
    await Promise.all(
      batch.map(async (generation) => {
        const ownerId =
          typeof generation.owner === 'object' && generation.owner
            ? generation.owner.id
            : generation.owner
        if (ownerId === undefined || ownerId === null) return
        try {
          const owner = await payload.findByID({
            collection: 'users',
            id: String(ownerId),
            overrideAccess: true,
            depth: 0,
          })
          const authUser = { ...owner, collection: 'users' } as unknown as AuthenticatedUser
          await refreshVideoGeneration(authUser, String(generation.id))
        } catch {
          // Keep a transient provider or storage failure recoverable on the next pass.
          await payload
            .update({
              collection: 'studio-generations',
              id: String(generation.id),
              overrideAccess: true,
              data: {
                errorCode: 'PROVIDER_STATUS_UNAVAILABLE',
                error: 'Provider status could not be checked. The worker will retry.',
                lastPolledAt: new Date().toISOString(),
              },
            })
            .catch(() => undefined)
        }
      }),
    )
  }

  let page = 1
  while (true) {
    const executions = await payload.find({
      collection: 'executions',
      overrideAccess: true,
      depth: 1,
      limit: 100,
      page,
      sort: 'updatedAt',
      where: { status: { in: ['running', 'interrupted'] } },
    })
    const taskExecutions = executions.docs.filter((execution) =>
      execution.nodeRecords?.some((record) => record.providerTask?.taskId),
    )
    for (let index = 0; index < taskExecutions.length; index += 5) {
      await Promise.all(
        taskExecutions.slice(index, index + 5).map(async (execution) => {
          const ownerId =
            typeof execution.owner === 'object' && execution.owner
              ? execution.owner.id
              : execution.owner
          if (ownerId === undefined || ownerId === null) return
          try {
            const owner = await payload.findByID({
              collection: 'users',
              id: String(ownerId),
              overrideAccess: true,
              depth: 0,
            })
            const authUser = { ...owner, collection: 'users' } as unknown as AuthenticatedUser
            const workflowService = await getWorkflowService(authUser)
            await workflowService.refreshVideoTask(String(execution.id))
          } catch {
            // Keep the persisted provider task for the next worker pass.
          }
        }),
      )
    }
    if (!executions.hasNextPage || !executions.nextPage) break
    page = executions.nextPage
  }
}

export function startStudioVideoGenerationWorker() {
  const workerGlobal = globalThis as WorkerGlobal
  if (workerGlobal.__znithVideoTaskWorker) return
  let polling = false
  const run = async () => {
    if (polling) return
    polling = true
    try {
      await pollPendingVideoTasks()
    } catch {
      // The next worker pass retries when Payload or the provider is unavailable.
    } finally {
      polling = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), pollIntervalMs)
  timer.unref?.()
  workerGlobal.__znithVideoTaskWorker = timer
}

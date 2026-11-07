import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { getPayloadClient } = vi.hoisted(() => ({ getPayloadClient: vi.fn() }))
const { getWorkflowService } = vi.hoisted(() => ({ getWorkflowService: vi.fn() }))
const { isStudioGenerationRunActive, refreshVideoGeneration } = vi.hoisted(() => ({
  isStudioGenerationRunActive: vi.fn(() => false),
  refreshVideoGeneration: vi.fn(),
}))

vi.mock('@/lib/payload', () => ({ getPayloadClient }))
vi.mock('@/lib/backend-services', () => ({ getWorkflowService }))
vi.mock('./refresh-video-generation', () => ({
  isStudioGenerationRunActive,
  refreshVideoGeneration,
}))

import { startStudioVideoGenerationWorker } from './video-generation-worker'

const workerGlobal = globalThis as typeof globalThis & {
  __znithVideoTaskWorker?: ReturnType<typeof setInterval>
}

afterEach(() => {
  if (workerGlobal.__znithVideoTaskWorker) clearInterval(workerGlobal.__znithVideoTaskWorker)
  delete workerGlobal.__znithVideoTaskWorker
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('studio video generation worker', () => {
  it('rechecks a persisted pending provider task on startup after a process restart', async () => {
    const owner = { id: 'user-1', email: 'synthetic@example.test' }
    const intervalCallback = vi.fn()
    let intervalDelay = 0
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      callback: unknown,
      delay?: unknown,
    ) => {
      intervalDelay = Number(delay)
      intervalCallback.mockImplementation(callback as () => void)
      return 0 as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval)

    const payload = {
      find: vi.fn(async (query: { collection: string; where: Record<string, unknown> }) => {
        if (query.collection === 'executions') return { docs: [] }
        const selector = JSON.stringify(query.where)
        return selector.includes('providerTaskId')
          ? {
              docs: [
                {
                  id: 'generation-1',
                  owner: { id: owner.id },
                  status: 'pending',
                  nodeRecords: [{ status: 'pending', providerTask: { taskId: 'provider-task-1' } }],
                },
              ],
            }
          : { docs: [] }
      }),
      findByID: vi.fn(async () => owner),
      update: vi.fn(async () => undefined),
    }
    getPayloadClient.mockResolvedValue(payload)
    refreshVideoGeneration.mockResolvedValue({ generation: { id: 'generation-1' }, changed: true })

    startStudioVideoGenerationWorker()
    await vi.waitFor(() => {
      expect(refreshVideoGeneration).toHaveBeenCalledWith(
        { ...owner, collection: 'users' },
        'generation-1',
      )
    })

    expect(intervalDelay).toBe(15_000)
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'studio-generations',
        where: expect.objectContaining({
          and: expect.arrayContaining([
            expect.objectContaining({ status: { in: ['pending', 'interrupted', 'running'] } }),
          ]),
        }),
      }),
    )
    expect(intervalCallback).not.toHaveBeenCalled()
  })
})

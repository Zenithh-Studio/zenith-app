import { describe, expect, it, vi } from 'vitest'
import { PayloadWorkflowRepository, type PayloadLocalApi } from './payload-workflow-repository'

function createRepository(updateOne: ReturnType<typeof vi.fn>) {
  return new PayloadWorkflowRepository({
    db: { updateOne },
  } as unknown as PayloadLocalApi)
}

describe('PayloadWorkflowRepository', () => {
  it('loads every workflow and execution page with access checks enabled', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: [{ id: 'workflow-1' }], hasNextPage: true, nextPage: 2 })
      .mockResolvedValueOnce({ docs: [{ id: 'workflow-2' }], hasNextPage: false, nextPage: null })
      .mockResolvedValueOnce({ docs: [{ id: 'execution-1' }], hasNextPage: false, nextPage: null })
    const repository = new PayloadWorkflowRepository({
      db: { updateOne: vi.fn() },
      find,
    } as unknown as PayloadLocalApi)

    await expect(repository.listAllWorkflows()).resolves.toEqual([
      { id: 'workflow-1' },
      { id: 'workflow-2' },
    ])
    await expect(repository.listAllExecutions()).resolves.toEqual([{ id: 'execution-1' }])

    expect(find).toHaveBeenNthCalledWith(1, {
      collection: 'workflows',
      overrideAccess: false,
      depth: 0,
      limit: 100,
      sort: '-updatedAt',
      page: 1,
    })
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: 'workflows', page: 2 }),
    )
    expect(find).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ collection: 'executions', page: 1 }),
    )
  })

  it('claims a workflow using one atomic conditional database update', async () => {
    const updateOne = vi.fn().mockResolvedValue({ id: 'workflow-1' })
    const repository = createRepository(updateOne)

    await expect(
      repository.claimWorkflowRun(
        'workflow-1',
        '2026-11-06T00:00:00.000Z',
        '2026-11-05T23:54:00.000Z',
      ),
    ).resolves.toBe('claimed')

    expect(updateOne).toHaveBeenCalledOnce()
    expect(updateOne).toHaveBeenCalledWith({
      collection: 'workflows',
      where: {
        and: [{ id: { equals: 'workflow-1' } }, { status: { not_equals: 'running' } }],
      },
      data: {
        status: 'running',
        lastExecutionAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      },
      options: { atomic: true },
    })
  })

  it('reclaims only a stale running workflow and rejects a fresh run', async () => {
    const updateOne = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'workflow-1' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    const repository = createRepository(updateOne)

    await expect(
      repository.claimWorkflowRun(
        'workflow-1',
        '2026-11-06T00:00:00.000Z',
        '2026-11-05T23:54:00.000Z',
      ),
    ).resolves.toBe('reclaimed')
    await expect(
      repository.claimWorkflowRun(
        'workflow-1',
        '2026-11-06T00:01:00.000Z',
        '2026-11-05T23:55:00.000Z',
      ),
    ).resolves.toBeNull()

    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          and: [
            { id: { equals: 'workflow-1' } },
            { status: { equals: 'running' } },
            { lastExecutionAt: { less_than: '2026-11-05T23:54:00.000Z' } },
          ],
        },
        options: { atomic: true },
      }),
    )
    expect(updateOne).toHaveBeenCalledTimes(4)
  })
})

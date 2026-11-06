import { describe, expect, it, vi } from 'vitest'
import { PayloadWorkflowRepository, type PayloadLocalApi } from './payload-workflow-repository'

function createRepository(updateOne: ReturnType<typeof vi.fn>) {
  return new PayloadWorkflowRepository({
    db: { updateOne },
  } as unknown as PayloadLocalApi)
}

describe('PayloadWorkflowRepository', () => {
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

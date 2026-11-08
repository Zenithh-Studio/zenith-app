import { describe, expect, it, vi } from 'vitest'
import type { AuthenticatedUser } from 'payload'
import { PayloadAssetRepository, type PayloadMediaApi } from './payload-asset-repository'
import { AssetQuotaExceededError } from '../domain/asset-repository'

const testUser = { id: 'user-1', collection: 'users' } as unknown as AuthenticatedUser

describe('PayloadAssetRepository', () => {
  it('deletes only requested media documents with access checks enabled', async () => {
    const deleteMedia = vi.fn(async () => ({ id: 'asset-1' }))
    const repository = new PayloadAssetRepository(
      {
        delete: deleteMedia,
      } as unknown as PayloadMediaApi,
      testUser,
    )

    await repository.deleteAssets(['asset-1', 'asset-2'])

    expect(deleteMedia).toHaveBeenCalledTimes(2)
    expect(deleteMedia).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'media',
        id: 'asset-1',
        overrideAccess: false,
      }),
    )
    expect(deleteMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'media',
        id: 'asset-2',
        overrideAccess: false,
      }),
    )
  })

  it('marks references as cleared when the asset service already reset them', async () => {
    const deleteMedia = vi.fn(async () => ({ id: 'asset-1' }))
    const repository = new PayloadAssetRepository(
      {
        delete: deleteMedia,
      } as unknown as PayloadMediaApi,
      testUser,
    )

    await repository.deleteAssets(['asset-1'], { assetReferencesCleared: true })

    expect(deleteMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        id: 'asset-1',
        overrideAccess: false,
        context: { assetReferencesCleared: true },
      }),
    )
  })

  it('preserves an administrator-assigned zero-byte quota', async () => {
    const payload = {
      findByID: vi.fn(async () => ({ storageQuotaBytes: 0, storageUsedBytes: 0 })),
      db: { updateOne: vi.fn(async () => ({ id: 'user-1' })) },
    } as unknown as PayloadMediaApi
    const repository = new PayloadAssetRepository(payload, testUser)

    await expect(repository.getQuota()).resolves.toEqual({ usedBytes: 0, limitBytes: 0 })
    await expect(repository.reserveQuota(1)).rejects.toBeInstanceOf(AssetQuotaExceededError)
    expect(payload.db.updateOne).not.toHaveBeenCalled()
  })
})

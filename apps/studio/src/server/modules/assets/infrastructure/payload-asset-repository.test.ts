import { describe, expect, it, vi } from 'vitest'
import { PayloadAssetRepository, type PayloadMediaApi } from './payload-asset-repository'

describe('PayloadAssetRepository', () => {
  it('deletes only requested media documents with access checks enabled', async () => {
    const deleteMedia = vi.fn(async () => ({ id: 'asset-1' }))
    const repository = new PayloadAssetRepository({
      delete: deleteMedia,
    } as unknown as PayloadMediaApi)

    await repository.deleteAssets(['asset-1', 'asset-2'])

    expect(deleteMedia).toHaveBeenCalledTimes(2)
    expect(deleteMedia).toHaveBeenNthCalledWith(1, {
      collection: 'media',
      id: 'asset-1',
      overrideAccess: false,
    })
    expect(deleteMedia).toHaveBeenNthCalledWith(2, {
      collection: 'media',
      id: 'asset-2',
      overrideAccess: false,
    })
  })

  it('marks references as cleared when the asset service already reset them', async () => {
    const deleteMedia = vi.fn(async () => ({ id: 'asset-1' }))
    const repository = new PayloadAssetRepository({
      delete: deleteMedia,
    } as unknown as PayloadMediaApi)

    await repository.deleteAssets(['asset-1'], { assetReferencesCleared: true })

    expect(deleteMedia).toHaveBeenCalledWith({
      collection: 'media',
      id: 'asset-1',
      overrideAccess: false,
      context: { assetReferencesCleared: true },
    })
  })
})

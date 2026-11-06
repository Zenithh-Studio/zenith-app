import { describe, expect, it, vi } from 'vitest'
import type { AssetDocument } from '@znith/contracts'
import type { AssetRepository, CreateAssetRecord } from '../domain/asset-repository'
import { AssetService } from './asset-service'

class MemoryAssetRepository implements AssetRepository {
  readonly createdAssets: CreateAssetRecord[] = []
  readonly deletedAssetIds: string[] = []

  async listAssets() {
    return []
  }

  async createAsset(data: CreateAssetRecord): Promise<AssetDocument> {
    this.createdAssets.push(data)
    return {
      id: 'asset-1',
      alt: data.alt,
      filename: data.file.name,
      mimeType: data.file.mimetype,
      filesize: data.file.size,
      createdAt: '2026-11-05T00:00:00.000Z',
    }
  }

  async deleteAssets(assetIds: string[]) {
    this.deletedAssetIds.push(...assetIds)
  }
}

const file = (overrides: Partial<CreateAssetRecord['file']> = {}): CreateAssetRecord['file'] => ({
  buffer: Buffer.from('file'),
  mimetype: 'image/png',
  name: 'studio.png',
  size: 4,
  ...overrides,
})

describe('AssetService', () => {
  it('trims alt text and stores the uploaded file', async () => {
    const repository = new MemoryAssetRepository()
    const service = new AssetService(repository)

    const asset = await service.uploadAsset({ alt: '  Product photo  ', file: file() })

    expect(asset.alt).toBe('Product photo')
    expect(repository.createdAssets).toHaveLength(1)
    expect(repository.createdAssets[0].file.name).toBe('studio.png')
  })

  it('uses the filename when alt text is blank', async () => {
    const repository = new MemoryAssetRepository()
    const service = new AssetService(repository)

    const asset = await service.uploadAsset({ alt: '  ', file: file() })

    expect(asset.alt).toBe('studio.png')
  })

  it('rejects unsupported media and oversized files before storage', async () => {
    const repository = new MemoryAssetRepository()
    const service = new AssetService(repository)

    await expect(
      service.uploadAsset({ alt: '', file: file({ mimetype: 'text/plain' }) }),
    ).rejects.toMatchObject({ statusCode: 415 })
    await expect(
      service.uploadAsset({ alt: '', file: file({ size: 50 * 1024 * 1024 + 1 }) }),
    ).rejects.toMatchObject({ statusCode: 413 })
    expect(repository.createdAssets).toEqual([])
  })

  it('clears workflow references before deleting a single or multiple assets', async () => {
    const repository = new MemoryAssetRepository()
    const calls: string[] = []
    const service = new AssetService(repository, {
      async clearAssetReferences(assetIds) {
        calls.push(`references:${assetIds.join(',')}`)
      },
    })

    await expect(service.deleteAssets(['asset-1', 'asset-2', 'asset-1'])).resolves.toEqual([
      'asset-1',
      'asset-2',
    ])

    expect(calls).toEqual(['references:asset-1,asset-2'])
    expect(repository.deletedAssetIds).toEqual(['asset-1', 'asset-2'])
  })

  it('rejects invalid bulk delete requests before changing workflows or media', async () => {
    const repository = new MemoryAssetRepository()
    const clearAssetReferences = async () => undefined
    const cleaner = { clearAssetReferences: vi.fn(clearAssetReferences) }
    const service = new AssetService(repository, cleaner)

    await expect(service.deleteAssets([])).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.deleteAssets(['asset-1', ' '])).rejects.toMatchObject({ statusCode: 400 })
    await expect(
      service.deleteAssets(Array.from({ length: 101 }, (_, index) => `asset-${index}`)),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(cleaner.clearAssetReferences).not.toHaveBeenCalled()
    expect(repository.deletedAssetIds).toEqual([])
  })
})

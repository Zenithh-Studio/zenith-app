import { describe, expect, it } from 'vitest'
import type { AssetDocument } from '@znith/contracts'
import type { AssetRepository, CreateAssetRecord } from '../domain/asset-repository'
import { AssetService } from './asset-service'

class MemoryAssetRepository implements AssetRepository {
  readonly createdAssets: CreateAssetRecord[] = []

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
})

import { describe, expect, it, vi } from 'vitest'
import type { AssetDocument } from '@znith/contracts'
import type { AssetRepository, CreateAssetRecord } from '../domain/asset-repository'
import { AssetService } from './asset-service'

class MemoryAssetRepository implements AssetRepository {
  readonly createdAssets: CreateAssetRecord[] = []
  readonly deletedAssetIds: string[] = []
  reservedQuota: number[] = []
  releasedQuota: number[] = []
  usedBytes = 0
  failOnCreateIndex?: number

  async listAssets() {
    return { docs: [], page: 1, totalDocs: 0, totalPages: 0 }
  }

  async countAssets() {
    return { all: 0, image: 0, video: 0, audio: 0, document: 0, other: 0 }
  }

  async findAssetsByIds(assetIds: string[]) {
    return assetIds.map((id) => ({ id, filesize: 4 }) as AssetDocument)
  }

  async saveWorkflowUpload(assetId: string) {
    return { id: assetId, alt: 'Saved upload', createdAt: '2026-11-05T00:00:00.000Z' }
  }

  async getQuota() {
    return { usedBytes: this.usedBytes, limitBytes: 5 * 1024 ** 3 }
  }

  async reserveQuota(bytes: number) {
    this.reservedQuota.push(bytes)
    this.usedBytes += bytes
  }

  async releaseQuota(bytes: number) {
    this.releasedQuota.push(bytes)
    this.usedBytes -= bytes
  }

  async createAsset(data: CreateAssetRecord): Promise<AssetDocument> {
    if (this.failOnCreateIndex === this.createdAssets.length) {
      throw new Error('Simulated media write failure.')
    }
    this.createdAssets.push(data)
    const asset = {
      id: `asset-${this.createdAssets.length}`,
      alt: data.alt,
      filename: data.file.name,
      mimeType: data.file.mimetype,
      filesize: data.file.size,
      createdAt: '2026-11-05T00:00:00.000Z',
    }
    return asset
  }

  async deleteAssets(assetIds: string[]) {
    this.deletedAssetIds.push(...assetIds)
  }
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const file = (overrides: Partial<CreateAssetRecord['file']> = {}): CreateAssetRecord['file'] => {
  const buffer = overrides.buffer || png
  return {
    buffer,
    mimetype: 'image/png',
    name: 'studio.png',
    size: buffer.byteLength,
    ...overrides,
  }
}

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

  it('reserves quota once for a batch and saves all derived files', async () => {
    const repository = new MemoryAssetRepository()
    const service = new AssetService(repository)
    const inputs = [
      { alt: 'Crop one', file: file({ name: 'crop-one.png' }), source: 'derived' as const },
      { alt: 'Crop two', file: file({ name: 'crop-two.png' }), source: 'derived' as const },
    ]

    const saved = await service.uploadAssets(inputs)

    expect(saved.map((asset) => asset.id)).toEqual(['asset-1', 'asset-2'])
    expect(repository.reservedQuota).toEqual([inputs[0].file.size + inputs[1].file.size])
    expect(repository.releasedQuota).toEqual([])
  })

  it('removes partial batch records and releases the full reservation on a failed write', async () => {
    const repository = new MemoryAssetRepository()
    repository.failOnCreateIndex = 1
    const service = new AssetService(repository)
    const inputs = [
      { alt: 'Crop one', file: file({ name: 'crop-one.png' }), source: 'derived' as const },
      { alt: 'Crop two', file: file({ name: 'crop-two.png' }), source: 'derived' as const },
    ]

    await expect(service.uploadAssets(inputs)).rejects.toThrow('Simulated media write failure.')

    expect(repository.deletedAssetIds).toEqual(['asset-1'])
    expect(repository.releasedQuota).toEqual([inputs[0].file.size + inputs[1].file.size])
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

  it('rejects a declared image type when the uploaded bytes are invalid', async () => {
    const repository = new MemoryAssetRepository()
    const service = new AssetService(repository)

    await expect(
      service.uploadAsset({ alt: '', file: file({ buffer: Buffer.from('not an image') }) }),
    ).rejects.toMatchObject({ statusCode: 415 })
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

    expect(calls).toEqual(['references:asset-1', 'references:asset-2'])
    expect(repository.deletedAssetIds).toEqual(['asset-1', 'asset-2'])
    expect(repository.releasedQuota).toEqual([4, 4])
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

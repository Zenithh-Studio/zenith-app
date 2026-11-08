import type { AssetDocument } from '@znith/contracts'
import sharp from 'sharp'
import {
  AssetQuotaExceededError,
  type AssetReferenceCleaner,
  type AssetRepository,
  type AssetListOptions,
  type AssetPage,
  type AssetQuota,
  type AssetTypeCounts,
  type CreateAssetRecord,
} from '../domain/asset-repository'

const allowedMimePrefixes = ['image/', 'video/', 'audio/', 'application/pdf']
const maximumUploadBytes = 50 * 1024 * 1024

function hasMediaSignature(buffer: Buffer, mimeType: string) {
  const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF'
  const isWebm =
    buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  const hasFtyp = buffer.toString('ascii', 4, 8) === 'ftyp'
  switch (mimeType) {
    case 'application/pdf':
      return buffer.toString('ascii', 0, 5) === '%PDF-'
    case 'image/png':
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))
    case 'image/webp':
      return isRiff && buffer.toString('ascii', 8, 12) === 'WEBP'
    case 'image/avif':
      return hasFtyp && /avif|avis/.test(buffer.toString('ascii', 8, 16))
    case 'video/mp4':
      return hasFtyp && !buffer.toString('ascii', 8, 12).startsWith('qt')
    case 'video/quicktime':
      return hasFtyp && buffer.toString('ascii', 8, 12).startsWith('qt')
    case 'video/webm':
    case 'audio/webm':
      return isWebm
    case 'audio/mpeg':
      return (
        buffer.toString('ascii', 0, 3) === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      )
    case 'audio/aac':
      return buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0
    case 'audio/wav':
      return isRiff && buffer.toString('ascii', 8, 12) === 'WAVE'
    case 'audio/ogg':
      return buffer.toString('ascii', 0, 4) === 'OggS'
    case 'audio/flac':
      return buffer.toString('ascii', 0, 4) === 'fLaC'
    case 'audio/mp4':
      return hasFtyp
    default:
      return false
  }
}

export class AssetValidationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = 'AssetValidationError'
  }
}

export class AssetService {
  constructor(
    private readonly repository: AssetRepository,
    private readonly referenceCleaner?: AssetReferenceCleaner,
  ) {}

  listAssets(options?: AssetListOptions): Promise<AssetPage> {
    return this.repository.listAssets(options)
  }

  getQuota(): Promise<AssetQuota> {
    return this.repository.getQuota()
  }

  async reserveStorage(bytes: number): Promise<void> {
    try {
      await this.repository.reserveQuota(bytes)
    } catch (error) {
      if (error instanceof AssetQuotaExceededError) {
        throw new AssetValidationError(error.message, 507)
      }
      throw error
    }
  }

  releaseStorage(bytes: number): Promise<void> {
    return this.repository.releaseQuota(bytes)
  }

  async uploadAssets(inputs: CreateAssetRecord[]): Promise<AssetDocument[]> {
    if (!Array.isArray(inputs) || !inputs.length) {
      throw new AssetValidationError('Choose at least one media file to save.', 400)
    }
    const normalized = await Promise.all(inputs.map((input) => this.validateUpload(input)))
    const reservedBytes = normalized.reduce((total, input) => total + input.file.size, 0)
    try {
      await this.repository.reserveQuota(reservedBytes)
    } catch (error) {
      if (error instanceof AssetQuotaExceededError) {
        throw new AssetValidationError(error.message, 507)
      }
      throw error
    }

    const created: AssetDocument[] = []
    try {
      for (const input of normalized) created.push(await this.repository.createAsset(input))
      return created
    } catch (error) {
      if (created.length) {
        try {
          await this.repository.deleteAssets(
            created.map((asset) => asset.id),
            { assetReferencesCleared: true },
          )
        } catch {
          // Keep the original create error; storage reservation is released below.
        }
      }
      await this.repository.releaseQuota(reservedBytes)
      throw error
    }
  }

  countAssets(search?: string): Promise<AssetTypeCounts> {
    return this.repository.countAssets(search)
  }

  findAssetsByIds(assetIds: string[]): Promise<AssetDocument[]> {
    return this.repository.findAssetsByIds(assetIds)
  }

  async saveWorkflowUpload(assetId: string): Promise<AssetDocument> {
    if (typeof assetId !== 'string' || !assetId.trim() || assetId.length > 128) {
      throw new AssetValidationError('Choose a valid workflow upload to save.', 400)
    }
    const [asset] = await this.repository.findAssetsByIds([assetId])
    if (!asset) throw new AssetValidationError('The workflow upload was not found.', 404)
    if (asset.source !== 'workflow' || asset.sourceExecution) return asset
    return this.repository.saveWorkflowUpload(assetId)
  }

  async uploadAsset(input: CreateAssetRecord): Promise<AssetDocument> {
    const [asset] = await this.uploadAssets([input])
    return asset
  }

  private async validateUpload(input: CreateAssetRecord): Promise<CreateAssetRecord> {
    if (!input.file.name.trim()) {
      throw new AssetValidationError('The uploaded file must have a name.', 400)
    }
    const reportedMimeType = input.file.mimetype.split(';', 1)[0]?.trim().toLowerCase()
    const mimeType =
      /\.m4a$/i.test(input.file.name) &&
      [
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'application/x-m4a',
        'application/octet-stream',
      ].includes(reportedMimeType)
        ? 'audio/mp4'
        : reportedMimeType
    if (!allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix))) {
      throw new AssetValidationError('This media type is not supported.', 415)
    }
    if (input.file.size > maximumUploadBytes) {
      throw new AssetValidationError('Media files must be 50 MB or smaller.', 413)
    }
    if (!input.file.size || input.file.size !== input.file.buffer.byteLength) {
      throw new AssetValidationError('The uploaded media file is empty or incomplete.', 400)
    }
    if (mimeType === 'image/svg+xml' || !hasMediaSignature(input.file.buffer, mimeType)) {
      throw new AssetValidationError('The file content does not match a supported media type.', 415)
    }
    if (mimeType.startsWith('image/')) {
      try {
        const metadata = await sharp(input.file.buffer).metadata()
        if (!metadata.width || !metadata.height) throw new Error('Image dimensions are missing.')
      } catch {
        throw new AssetValidationError('The uploaded image is invalid or damaged.', 415)
      }
    }

    const alt = input.alt.trim() || input.file.name
    return {
      ...input,
      file: { ...input.file, mimetype: mimeType },
      alt,
    }
  }

  async deleteAssets(assetIds: string[]) {
    if (
      !Array.isArray(assetIds) ||
      !assetIds.length ||
      assetIds.length > 100 ||
      assetIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 128)
    ) {
      throw new AssetValidationError('Select between 1 and 100 valid assets to delete.', 400)
    }
    const uniqueIds = [...new Set(assetIds)]
    const assets = await this.repository.findAssetsByIds(uniqueIds)
    if (assets.length !== uniqueIds.length) {
      throw new AssetValidationError('One or more assets were not found.', 404)
    }
    for (const asset of assets) {
      await this.referenceCleaner?.clearAssetReferences([asset.id])
      await this.repository.deleteAssets([asset.id], {
        assetReferencesCleared: Boolean(this.referenceCleaner),
      })
      await this.repository.releaseQuota(Math.max(0, Number(asset.filesize) || 0))
    }
    return uniqueIds
  }
}

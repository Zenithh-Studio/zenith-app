import type { AssetDocument } from '@znith/contracts'
import type {
  AssetReferenceCleaner,
  AssetRepository,
  CreateAssetRecord,
} from '../domain/asset-repository'

const allowedMimePrefixes = ['image/', 'video/', 'audio/', 'application/pdf']
const maximumUploadBytes = 50 * 1024 * 1024

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

  listAssets() {
    return this.repository.listAssets()
  }

  async uploadAsset(input: CreateAssetRecord): Promise<AssetDocument> {
    if (!input.file.name.trim()) {
      throw new AssetValidationError('The uploaded file must have a name.', 400)
    }
    if (!allowedMimePrefixes.some((prefix) => input.file.mimetype.startsWith(prefix))) {
      throw new AssetValidationError('This media type is not supported.', 415)
    }
    if (input.file.size > maximumUploadBytes) {
      throw new AssetValidationError('Media files must be 50 MB or smaller.', 413)
    }

    const alt = input.alt.trim() || input.file.name
    return this.repository.createAsset({
      ...input,
      alt: alt.slice(0, 500),
    })
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
    await this.referenceCleaner?.clearAssetReferences(uniqueIds)
    await this.repository.deleteAssets(uniqueIds, {
      assetReferencesCleared: Boolean(this.referenceCleaner),
    })
    return uniqueIds
  }
}

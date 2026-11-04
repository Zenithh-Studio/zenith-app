import type { AssetDocument } from '@znith/contracts'

export interface UploadedAssetFile {
  buffer: Buffer
  mimetype: string
  name: string
  size: number
}

export interface CreateAssetRecord {
  alt: string
  file: UploadedAssetFile
}

export interface AssetRepository {
  listAssets(): Promise<AssetDocument[]>
  createAsset(data: CreateAssetRecord): Promise<AssetDocument>
}

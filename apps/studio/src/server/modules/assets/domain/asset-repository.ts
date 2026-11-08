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
  source?: 'upload' | 'workflow' | 'studio' | 'derived'
  sourceWorkflow?: string
  sourceExecution?: string
  sourceGeneration?: string
  derivedFrom?: string
  derivedMetadata?: Record<string, unknown>
}

export interface AssetListOptions {
  search?: string
  type?: 'image' | 'video' | 'audio' | 'document' | 'other'
  sort?: string
  page?: number
  limit?: number
}

export interface AssetPage {
  docs: AssetDocument[]
  page: number
  totalDocs: number
  totalPages: number
}

export interface AssetQuota {
  usedBytes: number
  limitBytes: number
}

export interface AssetTypeCounts {
  all: number
  image: number
  video: number
  audio: number
  document: number
  other: number
}

export class AssetQuotaExceededError extends Error {
  constructor() {
    super('Your asset storage quota has been reached.')
    this.name = 'AssetQuotaExceededError'
  }
}

export interface AssetRepository {
  listAssets(options?: AssetListOptions): Promise<AssetPage>
  countAssets(search?: string): Promise<AssetTypeCounts>
  findAssetsByIds(assetIds: string[]): Promise<AssetDocument[]>
  saveWorkflowUpload(assetId: string): Promise<AssetDocument>
  createAsset(data: CreateAssetRecord): Promise<AssetDocument>
  deleteAssets(assetIds: string[], options?: { assetReferencesCleared?: boolean }): Promise<void>
  getQuota(): Promise<AssetQuota>
  reserveQuota(bytes: number): Promise<void>
  releaseQuota(bytes: number): Promise<void>
}

export interface AssetReferenceCleaner {
  clearAssetReferences(assetIds: string[]): Promise<void>
}

import type { AssetDocument } from '@znith/contracts'
import type { AssetRepository, CreateAssetRecord } from '../domain/asset-repository'

export interface PayloadMediaApi {
  find(options: {
    collection: 'media'
    overrideAccess: false
    depth: 0
    limit: number
    sort: string
  }): Promise<{ docs: unknown[] }>
  create(options: {
    collection: 'media'
    overrideAccess: false
    data: { alt: string }
    file: {
      data: Buffer
      mimetype: string
      name: string
      size: number
    }
  }): Promise<unknown>
}

function asAssetDocument(value: unknown): AssetDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('Payload returned an invalid media document.')
  }
  return value as AssetDocument
}

export class PayloadAssetRepository implements AssetRepository {
  constructor(private readonly payloadClient: PayloadMediaApi) {}

  async listAssets() {
    const { docs } = await this.payloadClient.find({
      collection: 'media',
      overrideAccess: false,
      depth: 0,
      limit: 100,
      sort: '-createdAt',
    })
    return docs.map(asAssetDocument)
  }

  async createAsset({ alt, file }: CreateAssetRecord) {
    const media = await this.payloadClient.create({
      collection: 'media',
      overrideAccess: false,
      data: { alt },
      file: {
        data: file.buffer,
        mimetype: file.mimetype,
        name: file.name,
        size: file.size,
      },
    })
    return asAssetDocument(media)
  }
}

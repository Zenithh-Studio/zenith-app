import type { AssetDocument } from '@znith/contracts'
import type { AssetRepository, CreateAssetRecord } from '../domain/asset-repository'
import type { AuthenticatedUser } from 'payload'
import {
  AssetQuotaExceededError,
  type AssetListOptions,
  type AssetPage,
  type AssetQuota,
  type AssetTypeCounts,
} from '../domain/asset-repository'

export interface PayloadMediaApi {
  find(options: {
    collection: 'media'
    overrideAccess: false
    depth: 0
    limit: number
    page?: number
    sort: string
    where?: Record<string, unknown>
    req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
  }): Promise<{ docs: unknown[]; page?: number; totalDocs?: number; totalPages?: number }>
  findByID(options: {
    collection: 'users'
    id: string | number
    overrideAccess: false
    depth: 0
    req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
  }): Promise<unknown>
  count(options: {
    collection: 'media'
    where?: Record<string, unknown>
    req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
  }): Promise<{ totalDocs: number }>
  create(options: {
    collection: 'media'
    overrideAccess: false
    data: Record<string, unknown>
    file: {
      data: Buffer
      mimetype: string
      name: string
      size: number
    }
    req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
  }): Promise<unknown>
  delete(options: {
    collection: 'media'
    id: string
    overrideAccess: false
    context?: Record<string, unknown>
    req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
  }): Promise<unknown>
  db: {
    updateOne(options: {
      collection: 'users'
      where: Record<string, unknown>
      data: Record<string, unknown>
      options: { atomic: true }
      req?: { user?: AuthenticatedUser | null; context?: Record<string, unknown> }
    }): Promise<unknown | null>
  }
}

function asAssetDocument(value: unknown): AssetDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('Payload returned an invalid media document.')
  }
  return value as AssetDocument
}

export class PayloadAssetRepository implements AssetRepository {
  constructor(
    private readonly payloadClient: PayloadMediaApi,
    private readonly user: AuthenticatedUser,
  ) {}

  private request(context?: Record<string, unknown>) {
    return { user: this.user, ...(context ? { context } : {}) }
  }

  async listAssets(options: AssetListOptions = {}): Promise<AssetPage> {
    const search = options.search?.trim()
    const where: Record<string, unknown>[] = []
    if (search) {
      where.push({
        or: [
          { filename: { contains: search } },
          { alt: { contains: search } },
          { title: { contains: search } },
        ],
      })
    }
    if (options.type && options.type !== 'other') {
      where.push(
        options.type === 'document'
          ? { mimeType: { equals: 'application/pdf' } }
          : { mimeType: { like: `${options.type}/%` } },
      )
    } else if (options.type === 'other') {
      where.push({
        or: [
          { mimeType: { exists: false } },
          {
            and: [
              { mimeType: { not_like: 'image/%' } },
              { mimeType: { not_like: 'video/%' } },
              { mimeType: { not_like: 'audio/%' } },
              { mimeType: { not_equals: 'application/pdf' } },
            ],
          },
        ],
      })
    }

    const result = await this.payloadClient.find({
      collection: 'media',
      overrideAccess: false,
      depth: 0,
      limit: Math.min(Math.max(options.limit ?? 40, 1), 100),
      page: Math.max(options.page ?? 1, 1),
      sort: options.sort || '-createdAt',
      ...(where.length ? { where: { and: where } } : {}),
      req: this.request(),
    })
    return {
      docs: result.docs.map(asAssetDocument),
      page: result.page ?? options.page ?? 1,
      totalDocs: result.totalDocs ?? result.docs.length,
      totalPages: result.totalPages ?? 1,
    }
  }

  async findAssetsByIds(assetIds: string[]) {
    const result = await this.payloadClient.find({
      collection: 'media',
      overrideAccess: false,
      depth: 0,
      limit: assetIds.length,
      sort: '-createdAt',
      where: { id: { in: assetIds } },
      req: this.request(),
    })
    return result.docs.map(asAssetDocument)
  }

  async countAssets(search?: string): Promise<AssetTypeCounts> {
    const query = search?.trim()
    const searchWhere = query
      ? {
          or: [
            { filename: { contains: query } },
            { alt: { contains: query } },
            { title: { contains: query } },
          ],
        }
      : undefined
    const count = async (typeWhere?: Record<string, unknown>) => {
      const clauses = [searchWhere, typeWhere].filter(Boolean)
      const result = await this.payloadClient.count({
        collection: 'media',
        ...(clauses.length ? { where: { and: clauses } } : {}),
        req: this.request(),
      })
      return result.totalDocs
    }
    const [all, image, video, audio, document] = await Promise.all([
      count(),
      count({ mimeType: { like: 'image/%' } }),
      count({ mimeType: { like: 'video/%' } }),
      count({ mimeType: { like: 'audio/%' } }),
      count({ mimeType: { equals: 'application/pdf' } }),
    ])
    return {
      all,
      image,
      video,
      audio,
      document,
      other: Math.max(0, all - image - video - audio - document),
    }
  }

  async createAsset(input: CreateAssetRecord) {
    const { alt, file } = input
    const media = await this.payloadClient.create({
      collection: 'media',
      overrideAccess: false,
      data: {
        alt,
        title: file.name,
        owner: this.user.id,
        source: input.source || 'upload',
        ...(input.sourceWorkflow ? { sourceWorkflow: input.sourceWorkflow } : {}),
        ...(input.sourceExecution ? { sourceExecution: input.sourceExecution } : {}),
        ...(input.sourceGeneration ? { sourceGeneration: input.sourceGeneration } : {}),
        ...(input.derivedFrom ? { derivedFrom: input.derivedFrom } : {}),
        ...(input.derivedMetadata ? { derivedMetadata: input.derivedMetadata } : {}),
      },
      file: {
        data: file.buffer,
        mimetype: file.mimetype,
        name: file.name,
        size: file.size,
      },
      req: this.request({ assetService: true }),
    })
    return asAssetDocument(media)
  }

  async deleteAssets(assetIds: string[], options?: { assetReferencesCleared?: boolean }) {
    for (const id of assetIds) {
      await this.payloadClient.delete({
        collection: 'media',
        id,
        overrideAccess: false,
        ...(options?.assetReferencesCleared ? { context: { assetReferencesCleared: true } } : {}),
        req: this.request({ assetService: true }),
      })
    }
  }

  async getQuota(): Promise<AssetQuota> {
    const user = (await this.payloadClient.findByID({
      collection: 'users',
      id: this.user.id,
      overrideAccess: false,
      depth: 0,
      req: this.request(),
    })) as { storageUsedBytes?: number; storageQuotaBytes?: number }
    const quotaValue = Number(user.storageQuotaBytes)
    return {
      usedBytes: Math.max(0, Number(user.storageUsedBytes) || 0),
      limitBytes: Math.max(0, Number.isFinite(quotaValue) ? quotaValue : 5 * 1024 * 1024 * 1024),
    }
  }

  reserveQuota(bytes: number) {
    return this.changeQuota(bytes)
  }

  releaseQuota(bytes: number) {
    return this.changeQuota(-bytes)
  }

  private async changeQuota(delta: number) {
    while (true) {
      const rawUser = await this.payloadClient.findByID({
        collection: 'users',
        id: this.user.id,
        overrideAccess: false,
        depth: 0,
        req: this.request(),
      })
      const user = rawUser as {
        storageUsedBytes?: number
        storageQuotaBytes?: number
        updatedAt?: string
      }
      const usedBytes = Math.max(0, Number(user.storageUsedBytes) || 0)
      const quotaValue = Number(user.storageQuotaBytes)
      const limitBytes = Math.max(
        0,
        Number.isFinite(quotaValue) ? quotaValue : 5 * 1024 * 1024 * 1024,
      )
      const next = Math.max(0, usedBytes + delta)
      if (delta > 0 && next > limitBytes) {
        throw new AssetQuotaExceededError()
      }
      const updated = await this.payloadClient.db.updateOne({
        collection: 'users',
        where: {
          and: [
            { id: { equals: this.user.id } },
            { storageUsedBytes: { equals: usedBytes } },
            ...(user.updatedAt ? [{ updatedAt: { equals: user.updatedAt } }] : []),
          ],
        },
        data: { storageUsedBytes: next, updatedAt: new Date().toISOString() },
        options: { atomic: true },
        req: this.request(),
      })
      if (updated) return
    }
  }
}

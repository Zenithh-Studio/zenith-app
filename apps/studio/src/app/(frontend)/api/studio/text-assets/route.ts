import { z } from 'zod'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getAssetService } from '@/lib/backend-services'
import { AssetValidationError } from '@/server/modules/assets'
import { withApiLogging } from '@/lib/server-logger'

const textAssetSchema = z
  .object({
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    source: z.enum(['manual', 'prompt', 'workflow', 'studio']).optional(),
    sourceId: z.string().optional(),
    metadata: z
      .object({
        provider: z.enum(['openai', 'replicate']).optional(),
        model: z.string().trim().min(1).max(120).optional(),
        sourceAssetId: z.string().min(1).max(128).optional(),
        action: z.enum(['describe-image', 'workflow-output', 'studio-output']).optional(),
        executionId: z.string().min(1).max(128).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

type AppUser = NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user']
type TextAsset = Record<string, unknown> & { id: string }
type PayloadTextAssetsApi = {
  find(options: {
    collection: 'text-assets'
    overrideAccess: false
    depth: 0
    limit: number
    page: number
    sort: string
    where?: Record<string, unknown>
    req: { user: AppUser }
  }): Promise<{ docs: TextAsset[]; page?: number; totalDocs?: number; totalPages?: number }>
  findByID(options: {
    collection: 'text-assets'
    id: string
    overrideAccess: false
    depth: 0
    req: { user: AppUser }
  }): Promise<TextAsset>
  create(options: {
    collection: 'text-assets'
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AppUser }
  }): Promise<TextAsset>
  update(options: {
    collection: 'text-assets'
    id: string
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AppUser }
  }): Promise<TextAsset>
  delete(options: {
    collection: 'text-assets'
    id: string
    overrideAccess: false
    req: { user: AppUser }
  }): Promise<unknown>
}

async function listTextAssets(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const query = new URL(request.url).searchParams
  const search = query.get('search')?.trim()
  const payload = (await getPayloadClient()) as unknown as PayloadTextAssetsApi
  const result = await payload.find({
    collection: 'text-assets',
    overrideAccess: false,
    depth: 0,
    limit: 40,
    page: Math.max(1, Math.floor(Number(query.get('page')) || 1)),
    sort: '-updatedAt',
    ...(search
      ? { where: { or: [{ title: { contains: search } }, { content: { contains: search } }] } }
      : {}),
    req: { user: session.user },
  })
  return Response.json({
    docs: result.docs,
    page: result.page ?? 1,
    totalDocs: result.totalDocs ?? result.docs.length,
    totalPages: result.totalPages ?? 1,
  })
}

async function createTextAsset(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid text asset details.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const parsed = textAssetSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Enter a title and text content.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadTextAssetsApi
  const assetService = await getAssetService(session.user)
  const bytes = Buffer.byteLength(parsed.data.content, 'utf8')
  try {
    await assetService.reserveStorage(bytes)
    try {
      const textAsset = await payload.create({
        collection: 'text-assets',
        overrideAccess: false,
        data: { ...parsed.data, owner: session.user.id, source: parsed.data.source || 'manual' },
        req: { user: session.user },
      })
      return Response.json({ textAsset }, { status: 201 })
    } catch (error) {
      await assetService.releaseStorage(bytes)
      throw error
    }
  } catch (error) {
    if (error instanceof AssetValidationError)
      return Response.json(
        { error: error.message, code: 'STORAGE_QUOTA' },
        { status: error.statusCode },
      )
    throw error
  }
}

async function updateTextAsset(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid text asset details.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof (body as { id?: unknown }).id !== 'string'
  ) {
    return Response.json(
      { error: 'A text asset ID is required.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const { id, ...input } = body as Record<string, unknown>
  const parsed = textAssetSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json(
      { error: 'Enter a title and text content.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadTextAssetsApi
  const assetService = await getAssetService(session.user)
  let previous: TextAsset
  try {
    previous = await payload.findByID({
      collection: 'text-assets',
      id: id as string,
      overrideAccess: false,
      depth: 0,
      req: { user: session.user },
    })
  } catch {
    return Response.json(
      { error: 'The text asset was not found.', code: 'TEXT_ASSET_NOT_FOUND' },
      { status: 404 },
    )
  }
  const nextBytes = Buffer.byteLength(parsed.data.content, 'utf8')
  const previousBytes =
    Number(previous.sizeBytes) || Buffer.byteLength(String(previous.content || ''), 'utf8')
  const delta = nextBytes - previousBytes
  if (delta > 0) await assetService.reserveStorage(delta)
  try {
    const textAsset = await payload.update({
      collection: 'text-assets',
      id: id as string,
      overrideAccess: false,
      data: parsed.data,
      req: { user: session.user },
    })
    if (delta < 0) await assetService.releaseStorage(-delta)
    return Response.json({ textAsset })
  } catch {
    if (delta > 0) await assetService.releaseStorage(delta)
    return Response.json(
      { error: 'The text asset was not found.', code: 'TEXT_ASSET_NOT_FOUND' },
      { status: 404 },
    )
  }
}

async function deleteTextAsset(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'A text asset ID is required.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const id = body && typeof body === 'object' && 'id' in body ? body.id : undefined
  if (typeof id !== 'string' || !id) {
    return Response.json(
      { error: 'A text asset ID is required.', code: 'INVALID_TEXT_ASSET' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadTextAssetsApi
  const assetService = await getAssetService(session.user)
  try {
    const textAsset = await payload.findByID({
      collection: 'text-assets',
      id,
      overrideAccess: false,
      depth: 0,
      req: { user: session.user },
    })
    await payload.delete({
      collection: 'text-assets',
      id,
      overrideAccess: false,
      req: { user: session.user },
    })
    await assetService.releaseStorage(
      Number(textAsset.sizeBytes) || Buffer.byteLength(String(textAsset.content || ''), 'utf8'),
    )
    return Response.json({ deletedId: id })
  } catch {
    return Response.json(
      { error: 'The text asset was not found.', code: 'TEXT_ASSET_NOT_FOUND' },
      { status: 404 },
    )
  }
}

export const GET = withApiLogging('/api/studio/text-assets', listTextAssets)
export const POST = withApiLogging('/api/studio/text-assets', createTextAsset)
export const PUT = withApiLogging('/api/studio/text-assets', updateTextAsset)
export const DELETE = withApiLogging('/api/studio/text-assets', deleteTextAsset)

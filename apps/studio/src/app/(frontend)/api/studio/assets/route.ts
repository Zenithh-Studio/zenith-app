import { AssetValidationError } from '@/server/modules/assets'
import { getAssetService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'

type AppUser = NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user']
type TextAssetRecord = Record<string, unknown> & {
  id: string
  title?: string
  content?: string
  createdAt?: string
}
type PayloadTextAssetReader = {
  find(options: {
    collection: 'text-assets'
    overrideAccess: false
    depth: 0
    limit: number
    page: number
    sort: string
    where?: Record<string, unknown>
    req: { user: AppUser }
  }): Promise<{ docs: TextAssetRecord[]; page?: number; totalDocs?: number; totalPages?: number }>
}

async function listAssets(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  try {
    const assetService = await getAssetService(session.user)
    const query = new URL(request.url).searchParams
    const requestedTypeValue = query.get('type') || 'all'
    const requestedType = ['all', 'text', 'image', 'video', 'audio', 'document', 'other'].includes(
      requestedTypeValue,
    )
      ? requestedTypeValue
      : 'all'
    const type = requestedType === 'all' || requestedType === 'text' ? undefined : requestedType
    const page = Number(query.get('page') || 1)
    const limit = Number(query.get('limit') || 40)
    const sortKeys: Record<string, string> = {
      'date-desc': '-createdAt',
      'date-asc': 'createdAt',
      'name-asc': 'filename',
      'name-desc': '-filename',
      'size-desc': '-filesize',
      'size-asc': 'filesize',
      'type-asc': 'mimeType',
    }
    const search = query.get('search') || undefined
    const pageNumber = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
    const pageSize = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 40
    const sort = sortKeys[query.get('sort') || 'date-desc'] || '-createdAt'
    const mediaType = ['image', 'video', 'audio', 'document', 'other'].includes(type || '')
      ? (type as 'image' | 'video' | 'audio' | 'document' | 'other')
      : undefined
    const [counts, quota] = await Promise.all([
      assetService.countAssets(search),
      assetService.getQuota(),
    ])
    const payload = (await getPayloadClient()) as unknown as PayloadTextAssetReader
    const where = search
      ? { or: [{ title: { contains: search } }, { content: { contains: search } }] }
      : undefined
    const isTextOnly = requestedType === 'text'
    const combineTypes = requestedType === 'all'
    const prefixSize = (pageNumber - 1) * pageSize + pageSize
    const textSort = sort.includes('filesize')
      ? sort.replace('filesize', 'sizeBytes')
      : sort.includes('At')
        ? sort
        : sort === 'filename' || sort === '-filename'
          ? sort.replace('filename', 'title')
          : sort
    const textResult =
      isTextOnly || combineTypes
        ? await payload.find({
            collection: 'text-assets',
            overrideAccess: false,
            depth: 0,
            limit: 100,
            page: 1,
            sort: textSort,
            ...(where ? { where } : {}),
            req: { user: session.user },
          })
        : await payload.find({
            collection: 'text-assets',
            overrideAccess: false,
            depth: 0,
            limit: 1,
            page: 1,
            sort: '-createdAt',
            ...(where ? { where } : {}),
            req: { user: session.user },
          })
    let textDocs = textResult.docs
    if (
      (isTextOnly || combineTypes) &&
      prefixSize > textDocs.length &&
      (textResult.totalPages || 1) > 1
    ) {
      const remainingPageCount = Math.min(
        Math.ceil(prefixSize / 100) - 1,
        (textResult.totalPages || 1) - 1,
      )
      const additionalPages = await Promise.all(
        Array.from({ length: remainingPageCount }, (_, index) => index + 2).map((nextPage) =>
          payload.find({
            collection: 'text-assets',
            overrideAccess: false,
            depth: 0,
            limit: 100,
            page: nextPage,
            sort: textSort,
            ...(where ? { where } : {}),
            req: { user: session.user },
          }),
        ),
      )
      textDocs = [...textDocs, ...additionalPages.flatMap((result) => result.docs)]
    }
    const textItems = textDocs.map((item) => ({
      ...item,
      kind: 'text' as const,
      filename: item.title || 'Text asset',
      alt: item.title || 'Text asset',
      mimeType: 'text/plain',
      filesize:
        Number(item.sizeBytes) || new TextEncoder().encode(String(item.content || '')).byteLength,
    }))

    if (isTextOnly) {
      return Response.json({
        docs: textItems.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        page: pageNumber,
        totalDocs: textResult.totalDocs ?? textItems.length,
        totalPages: Math.max(1, Math.ceil((textResult.totalDocs ?? textItems.length) / pageSize)),
        counts: {
          ...counts,
          text: textResult.totalDocs ?? textItems.length,
          all: counts.all + (textResult.totalDocs ?? textItems.length),
        },
        quota,
      })
    }

    const assets = mediaType
      ? await assetService.listAssets({
          search,
          type: mediaType,
          page: pageNumber,
          limit: pageSize,
          sort,
        })
      : await assetService.listAssets({ search, page: 1, limit: 100, sort })
    const additionalMediaPages =
      combineTypes && prefixSize > assets.docs.length
        ? await Promise.all(
            Array.from(
              { length: Math.min(Math.ceil(prefixSize / 100) - 1, assets.totalPages - 1) },
              (_, index) => index + 2,
            ).map((nextPage) =>
              assetService.listAssets({ search, page: nextPage, limit: 100, sort }),
            ),
          )
        : []
    const mediaResult = assets
    const mediaDocs = combineTypes
      ? [...assets.docs, ...additionalMediaPages.flatMap((result) => result.docs)]
      : assets.docs
    const normalizedMedia = mediaDocs.map((item) => ({ ...item, kind: 'media' as const }))
    const merged = combineTypes
      ? [...normalizedMedia, ...textItems]
          .sort((left, right) => {
            const descending = sort.startsWith('-') || sort.endsWith('desc')
            if (sort.includes('filesize')) {
              const comparison = (Number(left.filesize) || 0) - (Number(right.filesize) || 0)
              return descending ? -comparison : comparison
            }
            const leftValue =
              sort.endsWith('filename') || sort === 'filename'
                ? left.filename || ''
                : sort === 'mimeType'
                  ? left.mimeType || ''
                  : left.createdAt || ''
            const rightValue =
              sort.endsWith('filename') || sort === 'filename'
                ? right.filename || ''
                : sort === 'mimeType'
                  ? right.mimeType || ''
                  : right.createdAt || ''
            const comparison = String(leftValue).localeCompare(String(rightValue))
            return descending ? -comparison : comparison
          })
          .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      : normalizedMedia
    const textCount = textResult.totalDocs ?? textItems.length
    const totalDocs = combineTypes
      ? (mediaResult.totalDocs ?? 0) + textCount
      : mediaType
        ? assets.totalDocs
        : mediaResult.totalDocs
    return Response.json({
      docs: merged,
      page: pageNumber,
      totalDocs,
      totalPages: Math.max(1, Math.ceil((totalDocs || 0) / pageSize)),
      counts: { ...counts, text: textCount, all: counts.all + textCount },
      quota,
    })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/assets')
  }
}

async function uploadAsset(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Upload form data could not be read.' }, { status: 400 })
  }

  const uploadedFile = formData.get('file')
  if (!(uploadedFile instanceof File)) {
    return Response.json({ error: 'Choose a media file to upload.' }, { status: 400 })
  }

  try {
    const assetService = await getAssetService(session.user)
    const media = await assetService.uploadAsset({
      alt: String(formData.get('alt') || uploadedFile.name),
      file: {
        buffer: Buffer.from(await uploadedFile.arrayBuffer()),
        mimetype: uploadedFile.type,
        name: uploadedFile.name,
        size: uploadedFile.size,
      },
    })
    return Response.json({ media }, { status: 201 })
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return backendUnavailableResponse(error, '/api/studio/assets')
  }
}

async function deleteAssets(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'A JSON body with an ids array is required.', code: 'INVALID_ASSET_DELETE_REQUEST' },
      { status: 400 },
    )
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !('ids' in body) ||
    !Array.isArray(body.ids)
  ) {
    return Response.json(
      {
        error: 'Submit only an ids array when deleting assets.',
        code: 'INVALID_ASSET_DELETE_REQUEST',
      },
      { status: 400 },
    )
  }

  try {
    const assetService = await getAssetService(session.user)
    const deletedIds = await assetService.deleteAssets(body.ids as string[])
    return Response.json({ deletedIds, count: deletedIds.length })
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return Response.json(
        { error: error.message, code: 'INVALID_ASSET_DELETE_REQUEST' },
        { status: error.statusCode },
      )
    }
    return backendUnavailableResponse(error, '/api/studio/assets')
  }
}

export const GET = withApiLogging('/api/studio/assets', listAssets)
export const POST = withApiLogging('/api/studio/assets', uploadAsset)
export const DELETE = withApiLogging('/api/studio/assets', deleteAssets)

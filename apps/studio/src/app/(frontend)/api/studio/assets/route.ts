import { AssetValidationError } from '@/server/modules/assets'
import { getAssetService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'

async function listAssets() {
  try {
    const assetService = await getAssetService()
    const assets = await assetService.listAssets()
    return Response.json({ docs: assets })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/assets')
  }
}

async function uploadAsset(request: Request) {
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
    const assetService = await getAssetService()
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
    const assetService = await getAssetService()
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

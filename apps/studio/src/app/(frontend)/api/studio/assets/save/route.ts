import { AssetValidationError } from '@/server/modules/assets'
import { getAssetService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'

async function saveWorkflowUpload(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'A workflow asset id is required.' }, { status: 400 })
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !('assetId' in body) ||
    typeof body.assetId !== 'string'
  ) {
    return Response.json({ error: 'Submit only a valid assetId.' }, { status: 400 })
  }

  try {
    const assetService = await getAssetService(session.user)
    const media = await assetService.saveWorkflowUpload(body.assetId)
    return Response.json({ media })
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return backendUnavailableResponse(error, '/api/studio/assets/save')
  }
}

export const POST = withApiLogging('/api/studio/assets/save', saveWorkflowUpload)

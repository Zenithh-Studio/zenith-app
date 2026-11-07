import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withContextApiLogging } from '@/lib/server-logger'
import { refreshVideoGeneration } from '@/server/modules/studio/refresh-video-generation'

async function checkStatus(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  try {
    const result = await refreshVideoGeneration(session.user, id)
    return Response.json(result)
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/generations/[id]/status')
  }
}

export const POST = withContextApiLogging('/api/studio/generations/[id]/status', checkStatus)

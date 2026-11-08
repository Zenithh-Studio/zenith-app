import { z } from 'zod'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { withContextApiLogging } from '@/lib/server-logger'
import { WorkflowValidationError } from '@/server'

type SaveOutputRouteContext = { params: Promise<{ id: string }> }

const requestSchema = z
  .object({
    nodeId: z.string().trim().min(1).max(128),
    executionId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

async function saveOutput(request: Request, context: SaveOutputRouteContext) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Choose a valid workflow node.' }, { status: 400 })
  }

  try {
    const workflowService = await getWorkflowService(session.user)
    const result = await workflowService.saveNodeOutputToAssets(
      id,
      parsed.data.nodeId,
      parsed.data.executionId,
    )
    if (!result) return Response.json({ error: 'Generated output was not found.' }, { status: 404 })
    return Response.json(result)
  } catch (error) {
    if (error instanceof WorkflowValidationError) {
      return Response.json({ error: error.message }, { status: 422 })
    }
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]/save-output')
  }
}

export const POST = withContextApiLogging('/api/studio/workflows/[id]/save-output', saveOutput)

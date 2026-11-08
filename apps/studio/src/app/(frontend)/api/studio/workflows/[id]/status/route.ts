import { z } from 'zod'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { getWorkflowService } from '@/lib/backend-services'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { withContextApiLogging } from '@/lib/server-logger'

const requestSchema = z.object({ executionId: z.string().min(1) }).strict()
type WorkflowStatusRouteContext = { params: Promise<{ id: string }> }

async function refreshWorkflowTask(request: Request, context: WorkflowStatusRouteContext) {
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
  if (!parsed.success)
    return Response.json({ error: 'An execution ID is required.' }, { status: 400 })

  try {
    const workflowService = await getWorkflowService(session.user)
    const result = await workflowService.refreshVideoTask(parsed.data.executionId, id)
    if (result.status === 'not-found')
      return Response.json({ error: 'Workflow task not found.' }, { status: 404 })
    if (result.status === 'no-task')
      return Response.json(
        { error: 'This execution has no resumable video task.' },
        { status: 409 },
      )
    return Response.json(result)
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]/status')
  }
}

export const POST = withContextApiLogging('/api/studio/workflows/[id]/status', refreshWorkflowTask)

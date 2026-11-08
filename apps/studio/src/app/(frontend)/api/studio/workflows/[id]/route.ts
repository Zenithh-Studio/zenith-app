import { updateWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withContextApiLogging } from '@/lib/server-logger'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'

type WorkflowRouteContext = { params: Promise<{ id: string }> }

async function getWorkflow(_request: Request, context: WorkflowRouteContext) {
  const session = await getAppSession(_request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  try {
    const workflowService = await getWorkflowService(session.user)
    const { workflow, executions } = await workflowService.getWorkflow(id)
    if (!workflow) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return Response.json({ workflow, executions })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]')
  }
}

async function updateWorkflow(request: Request, context: WorkflowRouteContext) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsedRequest = updateWorkflowRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json(
      { error: 'Invalid workflow update.', issues: parsedRequest.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const workflowService = await getWorkflowService(session.user)
    const workflow = await workflowService.updateWorkflow(id, parsedRequest.data)
    if (!workflow) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return Response.json({ workflow })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]')
  }
}

async function deleteWorkflow(_request: Request, context: WorkflowRouteContext) {
  const session = await getAppSession(_request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  try {
    const workflowService = await getWorkflowService(session.user)
    const deleted = await workflowService.deleteWorkflow(id)
    if (!deleted) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]')
  }
}

export const GET = withContextApiLogging('/api/studio/workflows/[id]', getWorkflow)
export const PATCH = withContextApiLogging('/api/studio/workflows/[id]', updateWorkflow)
export const DELETE = withContextApiLogging('/api/studio/workflows/[id]', deleteWorkflow)

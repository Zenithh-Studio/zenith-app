import { executeWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withContextApiLogging } from '@/lib/server-logger'
import { WorkflowAlreadyRunningError, WorkflowValidationError } from '@/server'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'

type WorkflowExecutionRouteContext = { params: Promise<{ id: string }> }

async function executeWorkflow(request: Request, context: WorkflowExecutionRouteContext) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsedRequest = executeWorkflowRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json({ error: 'Invalid execution request.' }, { status: 400 })
  }

  try {
    const workflowService = await getWorkflowService(session.user)
    const execution = await workflowService.execute(id, parsedRequest.data)
    if (!execution) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return Response.json(execution, { status: execution.status === 'failed' ? 422 : 200 })
  } catch (error) {
    if (error instanceof WorkflowAlreadyRunningError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof WorkflowValidationError) {
      return Response.json({ error: error.message }, { status: 422 })
    }
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]/execute')
  }
}

async function cancelWorkflow(request: Request, context: WorkflowExecutionRouteContext) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const { id } = await context.params
  try {
    const workflowService = await getWorkflowService(session.user)
    const cancelled = await workflowService.cancel(id)
    if (!cancelled) {
      return Response.json(
        { error: 'No active workflow execution can be stopped.' },
        { status: 409 },
      )
    }
    return Response.json({ cancelled: true })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows/[id]/execute')
  }
}

export const POST = withContextApiLogging('/api/studio/workflows/[id]/execute', executeWorkflow)
export const DELETE = withContextApiLogging('/api/studio/workflows/[id]/execute', cancelWorkflow)

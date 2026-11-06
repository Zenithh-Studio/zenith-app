import { executeWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withContextApiLogging } from '@/lib/server-logger'
import { WorkflowAlreadyRunningError, WorkflowValidationError } from '@/server'

type WorkflowExecutionRouteContext = { params: Promise<{ id: string }> }

async function executeWorkflow(request: Request, context: WorkflowExecutionRouteContext) {
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
    const workflowService = await getWorkflowService()
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

export const POST = withContextApiLogging('/api/studio/workflows/[id]/execute', executeWorkflow)

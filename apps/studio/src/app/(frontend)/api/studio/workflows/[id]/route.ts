import { updateWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'

type WorkflowRouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: WorkflowRouteContext) {
  const { id } = await context.params
  try {
    const workflowService = await getWorkflowService()
    const { workflow, executions } = await workflowService.getWorkflow(id)
    if (!workflow) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return Response.json({ workflow, executions })
  } catch {
    return backendUnavailableResponse()
  }
}

export async function PATCH(request: Request, context: WorkflowRouteContext) {
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
    const workflowService = await getWorkflowService()
    const workflow = await workflowService.updateWorkflow(id, parsedRequest.data)
    if (!workflow) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return Response.json({ workflow })
  } catch {
    return backendUnavailableResponse()
  }
}

export async function DELETE(_request: Request, context: WorkflowRouteContext) {
  const { id } = await context.params
  try {
    const workflowService = await getWorkflowService()
    const deleted = await workflowService.deleteWorkflow(id)
    if (!deleted) return Response.json({ error: 'Workflow not found.' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch {
    return backendUnavailableResponse()
  }
}

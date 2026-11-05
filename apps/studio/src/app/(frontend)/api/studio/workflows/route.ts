import { createWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'

async function listWorkflows(request: Request) {
  const search = new URL(request.url).searchParams.get('search') ?? undefined
  try {
    const workflowService = await getWorkflowService()
    const workflows = await workflowService.listWorkflows(search)
    return Response.json({ docs: workflows })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows')
  }
}

async function createWorkflow(request: Request) {
  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsedRequest = createWorkflowRequestSchema.safeParse(requestBody)
  if (!parsedRequest.success) {
    return Response.json(
      { error: 'Invalid workflow data.', issues: parsedRequest.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const workflowService = await getWorkflowService()
    const workflow = await workflowService.createWorkflow(parsedRequest.data)
    return Response.json({ workflow }, { status: 201 })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/workflows')
  }
}

export const GET = withApiLogging('/api/studio/workflows', listWorkflows)
export const POST = withApiLogging('/api/studio/workflows', createWorkflow)

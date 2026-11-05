import { createWorkflowRequestSchema } from '@znith/contracts'
import { getWorkflowService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get('search') ?? undefined
  try {
    const workflowService = await getWorkflowService()
    const workflows = await workflowService.listWorkflows(search)
    return Response.json({ docs: workflows })
  } catch {
    return backendUnavailableResponse()
  }
}

export async function POST(request: Request) {
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
  } catch {
    return backendUnavailableResponse()
  }
}

import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'
import { runWorkflow } from '@/core/workflow/engine'
import type { WorkflowDefinition } from '@/core/workflow/types'

const executeSchema = z.object({
  targetNodeId: z.string().min(1).optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<'/api/studio/workflows/[id]/execute'>,
) {
  const { id } = await context.params
  const parsed = executeSchema.safeParse(await request.json())
  if (!parsed.success)
    return Response.json({ error: 'Invalid execution request.' }, { status: 400 })

  const payload = (await getPayloadClient()) as any
  let workflow
  try {
    workflow = await payload.findByID({
      collection: 'workflows',
      id,
      overrideAccess: false,
      depth: 0,
    })
  } catch {
    return Response.json({ error: 'Workflow not found.' }, { status: 404 })
  }

  const startedAt = new Date()
  const snapshot = structuredClone(workflow.definition) as WorkflowDefinition
  const execution = await payload.create({
    collection: 'executions',
    overrideAccess: false,
    data: {
      workflow: id,
      status: 'running',
      scope: parsed.data.targetNodeId
        ? `node:${parsed.data.targetNodeId}:with-dependencies`
        : 'workflow',
      startedAt: startedAt.toISOString(),
      snapshot,
      nodeRecords: [],
      logs: [],
    },
  })
  await payload.update({
    collection: 'workflows',
    id,
    overrideAccess: false,
    data: { status: 'running', lastExecutionAt: startedAt.toISOString() },
  })

  const result = await runWorkflow(snapshot, parsed.data.targetNodeId)
  const completedAt = new Date()
  await payload.update({
    collection: 'executions',
    id: execution.id,
    overrideAccess: false,
    data: {
      status: result.status,
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      nodeRecords: result.records,
      logs: result.logs,
      error: result.error,
    },
  })
  await payload.update({
    collection: 'workflows',
    id,
    overrideAccess: false,
    data: { status: result.status, lastExecutionAt: completedAt.toISOString() },
  })

  return Response.json(
    { executionId: execution.id, ...result },
    { status: result.status === 'failed' ? 422 : 200 },
  )
}

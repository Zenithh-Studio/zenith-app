import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'
import { workflowDefinitionSchema } from '@/core/workflow/engine'

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    definition: workflowDefinitionSchema.optional(),
  })
  .strict()

export async function GET(_request: Request, context: RouteContext<'/api/studio/workflows/[id]'>) {
  const { id } = await context.params
  const payload = (await getPayloadClient()) as any
  try {
    const workflow = await payload.findByID({
      collection: 'workflows',
      id,
      overrideAccess: false,
      depth: 0,
    })
    const executions = await payload.find({
      collection: 'executions',
      overrideAccess: false,
      depth: 0,
      limit: 20,
      sort: '-startedAt',
      where: { workflow: { equals: id } },
    })
    return Response.json({ workflow, executions: executions.docs })
  } catch {
    return Response.json({ error: 'Workflow not found.' }, { status: 404 })
  }
}

export async function PATCH(request: Request, context: RouteContext<'/api/studio/workflows/[id]'>) {
  const { id } = await context.params
  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid workflow update.', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as any
  try {
    const workflow = await payload.update({
      collection: 'workflows',
      id,
      overrideAccess: false,
      data: parsed.data,
    })
    return Response.json({ workflow })
  } catch {
    return Response.json({ error: 'Workflow could not be updated.' }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/studio/workflows/[id]'>,
) {
  const { id } = await context.params
  const payload = (await getPayloadClient()) as any
  try {
    await payload.delete({ collection: 'workflows', id, overrideAccess: false })
    return new Response(null, { status: 204 })
  } catch {
    return Response.json({ error: 'Workflow could not be deleted.' }, { status: 400 })
  }
}

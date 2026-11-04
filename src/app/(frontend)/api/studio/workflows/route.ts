import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'
import { workflowDefinitionSchema } from '@/core/workflow/engine'
import { workflowTemplates } from '@/core/workflow/templates'

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  templateId: z.enum(['blank', 'story', 'creative', 'video']).default('blank'),
  definition: workflowDefinitionSchema.optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()
  const payload = (await getPayloadClient()) as any
  const result = await payload.find({
    collection: 'workflows',
    overrideAccess: false,
    depth: 0,
    limit: 100,
    sort: '-updatedAt',
    ...(search
      ? {
          where: {
            or: [{ name: { contains: search } }, { description: { contains: search } }],
          },
        }
      : {}),
  })
  return Response.json({ docs: result.docs })
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid workflow data.', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const template = workflowTemplates[parsed.data.templateId]
  const payload = (await getPayloadClient()) as any
  const workflow = await payload.create({
    collection: 'workflows',
    overrideAccess: false,
    data: {
      name: parsed.data.name ?? template.name,
      description: parsed.data.description ?? template.description,
      category: template.category,
      status: 'idle',
      definition: parsed.data.definition ?? structuredClone(template.definition),
    },
  })
  return Response.json({ workflow }, { status: 201 })
}

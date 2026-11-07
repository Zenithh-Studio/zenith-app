import { z } from 'zod'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { withApiLogging } from '@/lib/server-logger'

const promptSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    content: z.string().trim().min(1),
    category: z.string().trim().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

type PayloadPromptsApi = {
  findByID(options: {
    collection: 'prompts'
    id: string
    overrideAccess: false
    depth: 0
    req: { user: NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user'] }
  }): Promise<Record<string, unknown>>
  find(options: {
    collection: 'prompts'
    overrideAccess: false
    depth: 0
    limit: number
    page: number
    sort: string
    where?: Record<string, unknown>
    req: { user: NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user'] }
  }): Promise<{
    docs: Array<Record<string, unknown>>
    page?: number
    totalDocs?: number
    totalPages?: number
  }>
  create(options: {
    collection: 'prompts'
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user'] }
  }): Promise<Record<string, unknown>>
  update(options: {
    collection: 'prompts'
    id: string
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user'] }
  }): Promise<Record<string, unknown>>
  delete(options: {
    collection: 'prompts'
    id: string
    overrideAccess: false
    req: { user: NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user'] }
  }): Promise<unknown>
}

async function listPrompts(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const query = new URL(request.url).searchParams
  const search = query.get('search')?.trim()
  const category = query.get('category')?.trim()
  const payload = (await getPayloadClient()) as unknown as PayloadPromptsApi
  const id = query.get('id')?.trim()
  if (id) {
    try {
      const prompt = await payload.findByID({
        collection: 'prompts',
        id,
        overrideAccess: false,
        depth: 0,
        req: { user: session.user },
      })
      return Response.json({ prompt })
    } catch {
      return Response.json(
        { error: 'The prompt was not found.', code: 'PROMPT_NOT_FOUND' },
        { status: 404 },
      )
    }
  }
  const clauses: Array<Record<string, unknown>> = []
  if (search)
    clauses.push({ or: [{ title: { contains: search } }, { content: { contains: search } }] })
  if (category) clauses.push({ category: { equals: category } })
  const result = await payload.find({
    collection: 'prompts',
    overrideAccess: false,
    depth: 0,
    limit: 100,
    page: Math.max(1, Math.floor(Number(query.get('page')) || 1)),
    sort: '-updatedAt',
    ...(clauses.length ? { where: { and: clauses } } : {}),
    req: { user: session.user },
  })
  return Response.json({
    docs: result.docs,
    page: result.page ?? 1,
    totalDocs: result.totalDocs ?? result.docs.length,
    totalPages: result.totalPages ?? 1,
  })
}

async function createPrompt(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid prompt details.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const parsed = promptSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Enter a title and prompt content.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadPromptsApi
  const prompt = await payload.create({
    collection: 'prompts',
    overrideAccess: false,
    data: {
      ...parsed.data,
      owner: session.user.id,
      tags: parsed.data.tags?.map((tag) => ({ tag })),
    },
    req: { user: session.user },
  })
  return Response.json({ prompt }, { status: 201 })
}

async function updatePrompt(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid prompt details.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof (body as { id?: unknown }).id !== 'string'
  ) {
    return Response.json(
      { error: 'A prompt ID is required.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const { id, ...input } = body as Record<string, unknown>
  const parsed = promptSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json(
      { error: 'Enter a title and prompt content.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadPromptsApi
  try {
    const prompt = await payload.update({
      collection: 'prompts',
      id: id as string,
      overrideAccess: false,
      data: { ...parsed.data, tags: parsed.data.tags?.map((tag) => ({ tag })) },
      req: { user: session.user },
    })
    return Response.json({ prompt })
  } catch {
    return Response.json(
      { error: 'The prompt was not found.', code: 'PROMPT_NOT_FOUND' },
      { status: 404 },
    )
  }
}

async function deletePrompt(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'A prompt ID is required.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const id = body && typeof body === 'object' && 'id' in body ? body.id : undefined
  if (typeof id !== 'string' || !id) {
    return Response.json(
      { error: 'A prompt ID is required.', code: 'INVALID_PROMPT' },
      { status: 400 },
    )
  }
  const payload = (await getPayloadClient()) as unknown as PayloadPromptsApi
  try {
    await payload.delete({
      collection: 'prompts',
      id,
      overrideAccess: false,
      req: { user: session.user },
    })
    return Response.json({ deletedId: id })
  } catch {
    return Response.json(
      { error: 'The prompt was not found.', code: 'PROMPT_NOT_FOUND' },
      { status: 404 },
    )
  }
}

export const GET = withApiLogging('/api/studio/prompts', listPrompts)
export const POST = withApiLogging('/api/studio/prompts', createPrompt)
export const PUT = withApiLogging('/api/studio/prompts', updatePrompt)
export const DELETE = withApiLogging('/api/studio/prompts', deletePrompt)

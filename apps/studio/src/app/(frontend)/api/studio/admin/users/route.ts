import { z } from 'zod'
import { appUserRole, getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { withApiLogging } from '@/lib/server-logger'

const updateSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'admin']).optional(),
    storageQuotaBytes: z.number().int().min(0).optional(),
    password: z.string().min(12).optional(),
  })
  .strict()

async function listUsers(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  if (appUserRole(session.user) !== 'admin') {
    return Response.json(
      { error: 'Administrator access is required.', code: 'FORBIDDEN' },
      { status: 403 },
    )
  }
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'users',
    overrideAccess: true,
    depth: 0,
    limit: 100,
    page: Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1),
    sort: 'email',
    select: {
      email: true,
      name: true,
      role: true,
      storageQuotaBytes: true,
      storageUsedBytes: true,
    },
  })
  return Response.json({
    users: result.docs.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storageQuotaBytes: user.storageQuotaBytes,
      storageUsedBytes: user.storageUsedBytes,
    })),
  })
}

async function updateUser(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  if (appUserRole(session.user) !== 'admin') {
    return Response.json(
      { error: 'Administrator access is required.', code: 'FORBIDDEN' },
      { status: 403 },
    )
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid account details.', code: 'INVALID_ADMIN_UPDATE' },
      { status: 400 },
    )
  }
  const parsed = updateSchema.safeParse(body)
  if (
    !parsed.success ||
    (!('role' in (parsed.data || {})) &&
      !('storageQuotaBytes' in (parsed.data || {})) &&
      !('password' in (parsed.data || {})))
  ) {
    return Response.json(
      { error: 'Enter valid account details.', code: 'INVALID_ADMIN_UPDATE' },
      { status: 400 },
    )
  }
  const { id, ...data } = parsed.data
  if (id === String(session.user.id) && data.role === 'user') {
    return Response.json(
      {
        error: 'The current administrator cannot remove their own admin role.',
        code: 'SELF_DEMOTION_BLOCKED',
      },
      { status: 400 },
    )
  }
  const payload = await getPayloadClient()
  try {
    const user = await payload.update({
      collection: 'users',
      id,
      overrideAccess: true,
      data,
      depth: 0,
      req: { user: session.user },
    })
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storageQuotaBytes: user.storageQuotaBytes,
        storageUsedBytes: user.storageUsedBytes,
      },
    })
  } catch {
    return Response.json(
      { error: 'The account could not be updated.', code: 'ACCOUNT_UPDATE_FAILED' },
      { status: 404 },
    )
  }
}

export const GET = withApiLogging('/api/studio/admin/users', listUsers)
export const PATCH = withApiLogging('/api/studio/admin/users', updateUser)

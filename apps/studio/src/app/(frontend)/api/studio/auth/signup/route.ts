import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'
import { withApiLogging } from '@/lib/server-logger'
import {
  consumeSignupAttempt,
  type SignupRateLimitPayload,
} from '@/server/modules/auth/signup-rate-limit'

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(12, 'Use at least 12 characters for your password.'),
  name: z.string().trim().optional(),
  adminSetupToken: z.string().optional(),
})

function matchesSetupToken(candidate: string | undefined) {
  const configured = process.env.APP_ADMIN_SETUP_TOKEN
  if (!configured || !candidate) return false
  const expected = createHash('sha256').update(configured).digest()
  const received = createHash('sha256').update(candidate).digest()
  return timingSafeEqual(expected, received)
}

async function signUp(request: Request) {
  const payload = await getPayloadClient()
  let allowed: boolean
  try {
    allowed = await consumeSignupAttempt(payload as unknown as SignupRateLimitPayload, request)
  } catch {
    return Response.json(
      {
        error: 'Signup is temporarily unavailable. Try again later.',
        code: 'RATE_LIMIT_UNAVAILABLE',
      },
      { status: 503 },
    )
  }
  if (!allowed) {
    return Response.json(
      { error: 'Too many signup attempts. Try again later.', code: 'RATE_LIMITED' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid account details.', code: 'INVALID_SIGNUP' },
      { status: 400 },
    )
  }
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === 'password')
    return Response.json(
      {
        error: passwordIssue?.message || 'Enter valid account details.',
        code: passwordIssue ? 'WEAK_PASSWORD' : 'INVALID_SIGNUP',
      },
      { status: 400 },
    )
  }

  const wantsAdmin = matchesSetupToken(parsed.data.adminSetupToken)
  let transactionID: number | string | null = null

  try {
    if (wantsAdmin) {
      transactionID = await payload.db.beginTransaction()
      if (!transactionID) throw new Error('The database must support transactions for admin setup.')
    }
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
        name: parsed.data.name || undefined,
      },
      ...(transactionID ? { req: { transactionID } } : {}),
    })

    if (wantsAdmin) {
      const setup = await payload.find({
        collection: 'admin-setup',
        overrideAccess: true,
        limit: 1,
        where: { setupKey: { equals: 'initial-admin' } },
      })
      if (setup.docs.length) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID)
        return signupAccepted()
      }

      if (transactionID) {
        await payload.create({
          collection: 'admin-setup',
          overrideAccess: true,
          data: { setupKey: 'initial-admin', claimedBy: user.id },
          req: { transactionID },
        })
        await payload.update({
          collection: 'users',
          id: user.id,
          overrideAccess: true,
          data: { role: 'admin' },
          req: { transactionID, context: { adminSetup: true } },
        })
        await payload.db.commitTransaction(transactionID)
      }
    }
    return signupAccepted()
  } catch {
    if (transactionID) {
      try {
        await payload.db.rollbackTransaction(transactionID)
      } catch {
        // Do not replace the generic signup response with persistence details.
      }
    }
    return signupAccepted()
  }
}

function signupAccepted() {
  return Response.json(
    { message: 'Signup request received. Try signing in if the email can be registered.' },
    { status: 200 },
  )
}

export const POST = withApiLogging('/api/studio/auth/signup', signUp)

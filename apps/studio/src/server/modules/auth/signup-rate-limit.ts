import 'server-only'

import { createHmac } from 'node:crypto'

const signupAttemptLimit = 5
const signupWindowMs = 10 * 60 * 1000

type SignupAttempt = {
  id: string | number
  ipHash: string
  count: number
  resetAt: string
  updatedAt: string
}

export interface SignupRateLimitPayload {
  find(options: {
    collection: 'signup-attempts'
    overrideAccess: true
    depth: 0
    limit: 1
    where: Record<string, unknown>
  }): Promise<{ docs: unknown[] }>
  create(options: {
    collection: 'signup-attempts'
    overrideAccess: true
    data: Record<string, unknown>
  }): Promise<unknown>
  db: {
    updateOne(options: {
      collection: 'signup-attempts'
      where: Record<string, unknown>
      data: Record<string, unknown>
      options: { atomic: true }
    }): Promise<unknown | null>
  }
}

function clientAddress(request: Request) {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function hashedAddress(address: string) {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is required for signup rate limiting.')
  return createHmac('sha256', secret).update(`signup-rate-limit:v1:${address}`).digest('hex')
}

export async function consumeSignupAttempt(
  payload: SignupRateLimitPayload,
  request: Request,
  now = Date.now(),
) {
  const ipHash = hashedAddress(clientAddress(request))
  while (true) {
    const result = await payload.find({
      collection: 'signup-attempts',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { ipHash: { equals: ipHash } },
    })
    const current = result.docs[0] as SignupAttempt | undefined
    if (!current) {
      try {
        await payload.create({
          collection: 'signup-attempts',
          overrideAccess: true,
          data: { ipHash, count: 1, resetAt: new Date(now + signupWindowMs).toISOString() },
        })
        return true
      } catch (error) {
        // Retry only when a concurrent request won the unique-key insert race.
        const raced = await payload.find({
          collection: 'signup-attempts',
          overrideAccess: true,
          depth: 0,
          limit: 1,
          where: { ipHash: { equals: ipHash } },
        })
        if (raced.docs.length) continue
        throw error
      }
    }

    const activeWindow = new Date(current.resetAt).getTime() > now
    if (activeWindow && current.count >= signupAttemptLimit) return false
    const updated = await payload.db.updateOne({
      collection: 'signup-attempts',
      where: {
        and: [
          { id: { equals: current.id } },
          { count: { equals: current.count } },
          { updatedAt: { equals: current.updatedAt } },
        ],
      },
      data: {
        count: activeWindow ? current.count + 1 : 1,
        resetAt: activeWindow ? current.resetAt : new Date(now + signupWindowMs).toISOString(),
        updatedAt: new Date(now).toISOString(),
      },
      options: { atomic: true },
    })
    if (updated) return true
  }
}

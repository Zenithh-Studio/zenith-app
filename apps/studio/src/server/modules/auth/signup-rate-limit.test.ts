vi.mock('server-only', () => ({}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeSignupAttempt, type SignupRateLimitPayload } from './signup-rate-limit'

type StoredAttempt = {
  id: number
  ipHash: string
  count: number
  resetAt: string
  updatedAt: string
}

function createPayload(): SignupRateLimitPayload {
  const attempts: StoredAttempt[] = []
  let nextId = 1
  return {
    find: vi.fn(async ({ where }) => {
      const hash = (where.ipHash as { equals: string }).equals
      return {
        docs: attempts
          .filter((attempt) => attempt.ipHash === hash)
          .map((attempt) => ({ ...attempt })),
      }
    }),
    create: vi.fn(async ({ data }) => {
      const ipHash = String(data.ipHash)
      if (attempts.some((attempt) => attempt.ipHash === ipHash))
        throw new Error('Unique key conflict')
      const attempt: StoredAttempt = {
        id: nextId++,
        ipHash,
        count: Number(data.count),
        resetAt: String(data.resetAt),
        updatedAt: new Date().toISOString(),
      }
      attempts.push(attempt)
      return { ...attempt }
    }),
    db: {
      updateOne: vi.fn(async ({ where, data }) => {
        const clauses = where.and as Array<Record<string, { equals: unknown }>>
        const id = clauses.find((clause) => 'id' in clause)?.id.equals
        const count = clauses.find((clause) => 'count' in clause)?.count.equals
        const updatedAt = clauses.find((clause) => 'updatedAt' in clause)?.updatedAt.equals
        const attempt = attempts.find((item) => item.id === id)
        if (!attempt || attempt.count !== count || attempt.updatedAt !== updatedAt) return null
        Object.assign(attempt, data)
        return { ...attempt }
      }),
    },
  }
}

describe('consumeSignupAttempt', () => {
  beforeEach(() => vi.stubEnv('PAYLOAD_SECRET', 'test-payload-secret'))

  it('allows five signup attempts per address and rejects the sixth within ten minutes', async () => {
    const payload = createPayload()
    const request = new Request('https://zenith.test/api/studio/auth/signup', {
      headers: { 'x-real-ip': '203.0.113.15' },
    })
    const now = Date.UTC(2026, 10, 7)

    const results = await Promise.all(
      Array.from({ length: 6 }, () => consumeSignupAttempt(payload, request, now)),
    )

    expect(results.filter(Boolean)).toHaveLength(5)
    expect(results.filter((allowed) => !allowed)).toHaveLength(1)
  })

  it('starts a new window after ten minutes and keeps other addresses separate', async () => {
    const payload = createPayload()
    const firstAddress = new Request('https://zenith.test/api/studio/auth/signup', {
      headers: { 'x-real-ip': '203.0.113.20' },
    })
    const secondAddress = new Request('https://zenith.test/api/studio/auth/signup', {
      headers: { 'x-real-ip': '203.0.113.21' },
    })
    const now = Date.UTC(2026, 10, 7)

    for (let index = 0; index < 5; index += 1) {
      expect(await consumeSignupAttempt(payload, firstAddress, now)).toBe(true)
    }
    expect(await consumeSignupAttempt(payload, firstAddress, now)).toBe(false)
    expect(await consumeSignupAttempt(payload, firstAddress, now + 10 * 60 * 1000)).toBe(true)
    expect(await consumeSignupAttempt(payload, secondAddress, now)).toBe(true)
  })
})

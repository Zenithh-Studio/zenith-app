import { withContextApiLogging } from '@/lib/server-logger'

function result(
  body: { connected: boolean; errorCode?: 'missing-key' | 'invalid-key' | 'gateway-unavailable' },
  status: number,
) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function connectMuse2API() {
  const apiKey = process.env.MUSE2API_API_KEY || process.env.APP_MUSE2API_API_KEY
  if (!apiKey) return result({ connected: false, errorCode: 'missing-key' }, 503)

  const baseURL = process.env.APP_MUSE2API_BASE_URL
  if (!baseURL) return result({ connected: false, errorCode: 'gateway-unavailable' }, 503)

  let endpoint: URL
  try {
    const base = new URL(baseURL)
    if (
      (base.protocol !== 'http:' && base.protocol !== 'https:') ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      return result({ connected: false, errorCode: 'gateway-unavailable' }, 503)
    }
    endpoint = new URL(`${base.toString().replace(/\/+$/, '')}/models`)
  } catch {
    return result({ connected: false, errorCode: 'gateway-unavailable' }, 503)
  }

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
    cache: 'no-store',
  }).catch(() => null)

  if (!response) return result({ connected: false, errorCode: 'gateway-unavailable' }, 502)
  if (response.status === 401 || response.status === 403) {
    return result({ connected: false, errorCode: 'invalid-key' }, 401)
  }
  if (!response.ok) return result({ connected: false, errorCode: 'gateway-unavailable' }, 502)
  return result({ connected: true }, 200)
}

export const POST = withContextApiLogging('/api/studio/providers/muse2api/connect', connectMuse2API)

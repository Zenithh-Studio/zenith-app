import { withContextApiLogging } from '@/lib/server-logger'
import {
  withProviderCredentials,
  type ProviderCredentials,
} from '@/server/modules/providers/credential-context'
import { inlineMuse2APIMedia } from '@/server/modules/workflows/infrastructure/muse2api-media'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function recoverMuse2APIMedia(request: Request) {
  const body = await request.json().catch(() => null)
  if (!isRecord(body) || typeof body.url !== 'string' || !body.url || body.url.length > 4096) {
    return Response.json({ error: 'A valid Muse2API media URL is required.' }, { status: 400 })
  }

  const credentialInput = isRecord(body.credentials) ? body.credentials : {}
  const keys = isRecord(credentialInput.keys) ? credentialInput.keys : {}
  const baseUrls = isRecord(credentialInput.baseUrls) ? credentialInput.baseUrls : {}
  const apiKey = typeof keys.muse2api === 'string' ? keys.muse2api : ''
  const baseUrl = typeof baseUrls.muse2api === 'string' ? baseUrls.muse2api : ''
  const credentials: ProviderCredentials = {
    ...(apiKey ? { keys: { muse2api: apiKey } } : {}),
    ...(baseUrl ? { baseUrls: { muse2api: baseUrl } } : {}),
  }

  const media = await withProviderCredentials(credentials, () =>
    inlineMuse2APIMedia(body.url as string, typeof body.mimeType === 'string' ? body.mimeType : ''),
  )
  if (!media) {
    return Response.json(
      { error: 'The saved Muse2API video could not be loaded.' },
      { status: 404 },
    )
  }
  return Response.json(media)
}

export const POST = withContextApiLogging('/api/studio/media/muse2api', recoverMuse2APIMedia)

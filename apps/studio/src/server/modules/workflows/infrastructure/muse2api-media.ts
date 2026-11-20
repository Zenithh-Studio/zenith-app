import {
  resolveProviderBaseUrl,
  resolveProviderKey,
  validateProviderBaseUrl,
} from '@/server/modules/providers/credential-context'

const MAX_MUSE2API_MEDIA_BYTES = 150 * 1024 * 1024

export async function inlineMuse2APIMedia(
  source: string,
  fallbackMimeType = '',
): Promise<{ url: string; mimeType: string } | null> {
  const serverBase = process.env.APP_MUSE2API_BASE_URL || ''
  const configuredBase = resolveProviderBaseUrl('muse2api', serverBase)
  if (!source || !configuredBase) return null
  if (configuredBase !== serverBase) {
    try {
      await validateProviderBaseUrl(configuredBase)
    } catch {
      return null
    }
  }

  let baseURL: URL
  let url: URL
  try {
    baseURL = new URL(configuredBase.replace(/\/+$/, '') + '/')
    url = new URL(source, baseURL)
  } catch {
    return null
  }

  const mediaPrefix = baseURL.pathname.replace(/\/+$/, '') + '/media/'
  if (
    url.origin !== baseURL.origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(mediaPrefix)
  ) {
    return null
  }

  let apiKey: string
  try {
    apiKey = resolveProviderKey('APP_MUSE2API_API_KEY')
  } catch {
    return null
  }

  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + apiKey },
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  }).catch(() => null)
  if (!response?.ok) return null

  const size = Number(response.headers.get('content-length'))
  if (Number.isFinite(size) && size > MAX_MUSE2API_MEDIA_BYTES) return null
  const arrayBuffer = await response.arrayBuffer().catch(() => null)
  if (!arrayBuffer || !arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_MUSE2API_MEDIA_BYTES)
    return null

  const responseMimeType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
  const mimeType = responseMimeType?.startsWith('video/')
    ? responseMimeType
    : responseMimeType === 'application/octet-stream' || !responseMimeType
      ? fallbackMimeType.startsWith('video/')
        ? fallbackMimeType
        : 'video/mp4'
      : ''
  if (!mimeType) return null

  return {
    url: 'data:' + mimeType + ';base64,' + Buffer.from(arrayBuffer).toString('base64'),
    mimeType,
  }
}

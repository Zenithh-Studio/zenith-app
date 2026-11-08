import type { NodeValue, WorkflowNode } from '@znith/contracts'
import { lookup as dnsLookup } from 'node:dns/promises'
import https from 'node:https'
import { isIP } from 'node:net'
import { AssetService } from '../../assets/application/asset-service'
import type {
  WorkflowOutputPersistenceResult,
  WorkflowOutputPersister,
} from './workflow-service.types'

const generatedMediaNodeTypes = new Set([
  'ai.generate-image',
  'ai.edit-image',
  'ai.generate-video',
  'ai.image-to-video',
  'ai.generate-audio',
])

const maximumGeneratedMediaBytes = 50 * 1024 * 1024

type MediaFile = {
  buffer: Buffer
  mimetype: string
  name: string
  size: number
}

export type PersistedMediaFile = MediaFile

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMediaUrl(value: unknown) {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.url === 'string') return value.url
  return ''
}

function defaultMimeType(type: NodeValue['type']) {
  return type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/png'
}

function normalizeMimeType(value: string | null | undefined, type: NodeValue['type']) {
  const expectedPrefix = `${type}/`
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase()
  if (!mimeType || mimeType === 'application/octet-stream') return defaultMimeType(type)
  if (!mimeType.startsWith(expectedPrefix)) {
    throw new Error('Generated media returned an unsupported content type.')
  }
  return mimeType
}

function extensionFor(mimeType: string) {
  const knownExtensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  }
  return knownExtensions[mimeType] || mimeType.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin'
}

function resolveMediaUrl(source: string) {
  const baseUrl =
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const resolved = new URL(source, baseUrl)
  const site = new URL(baseUrl)

  if (
    resolved.origin === site.origin &&
    ['localhost', '127.0.0.1'].includes(site.hostname) &&
    site.port !== (process.env.PORT || '3000')
  ) {
    resolved.hostname = '127.0.0.1'
    resolved.port = process.env.PORT || '3000'
  }

  return resolved.toString()
}

function publicIPv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false
  const [first, second, third] = parts
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (
    first === 192 &&
    (second === 168 ||
      (second === 0 && third === 0) ||
      (second === 0 && third === 2) ||
      (second === 88 && third === 99))
  )
    return false
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    return false
  if (first === 203 && second === 0 && third === 113) return false
  return true
}

function ipv6Groups(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0]
  const [before, after = ''] = normalized.split('::')
  const left = before ? before.split(':').filter(Boolean) : []
  const right = after ? after.split(':').filter(Boolean) : []
  const missing = 8 - left.length - right.length
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => '0'), ...right]
  if (groups.length !== 8) return undefined
  const parsed = groups.map((group) => Number.parseInt(group || '0', 16))
  return parsed.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? parsed
    : undefined
}

function isPublicAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return publicIPv4(address)
  if (family !== 6) return false
  const groups = ipv6Groups(address)
  if (!groups) return false
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.')
    return publicIPv4(mapped)
  }
  const first = groups[0]
  if (first < 0x2000 || first > 0x3fff) return false
  if ((first === 0x2001 && groups[1] <= 0x01ff) || first === 0x2002) return false
  if (first === 0x2001 && groups[1] === 0x0db8) return false
  if (first === 0x3fff && groups[1] <= 0x0fff) return false
  return true
}

async function collectResponseBody(body: AsyncIterable<Uint8Array> | null, contentLength: number) {
  if (Number.isFinite(contentLength) && contentLength > maximumGeneratedMediaBytes) {
    throw new Error('Generated media is larger than the 50 MB local storage limit.')
  }
  const chunks: Buffer[] = []
  let size = 0
  if (!body) return Buffer.alloc(0)
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > maximumGeneratedMediaBytes) {
      throw new Error('Generated media is larger than the 50 MB local storage limit.')
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size)
}

async function downloadExternal(url: URL) {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new Error('Generated media must use a public HTTPS URL.')
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await dnsLookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Generated media URL cannot target local or private networks.')
  }
  const pinnedAddress = addresses[0]
  const pinnedLookup = ((hostname, _options, callback) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      callback(new Error('Generated media host changed during download.'), '', 0)
      return
    }
    callback(null, pinnedAddress.address, pinnedAddress.family)
  }) as NonNullable<https.RequestOptions['lookup']>

  const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const request = https.get(
      url,
      { lookup: pinnedLookup, signal: AbortSignal.timeout(120_000) },
      resolve,
    )
    request.once('error', reject)
  })
  if (response.statusCode !== 200) {
    response.destroy()
    throw new Error('Generated media could not be downloaded for local storage.')
  }
  const contentLength = Number(response.headers['content-length'])
  const buffer = await collectResponseBody(response, contentLength)
  return {
    buffer,
    contentType: Array.isArray(response.headers['content-type'])
      ? response.headers['content-type'][0]
      : response.headers['content-type'],
  }
}

async function downloadMedia(
  source: string,
  outputType: 'image' | 'video' | 'audio',
  provider?: string,
): Promise<MediaFile> {
  if (source.startsWith('data:')) {
    const comma = source.indexOf(',')
    if (comma < 0) throw new Error('Generated media returned an invalid data URL.')

    const metadata = source.slice(5, comma)
    const payload = source.slice(comma + 1)
    const mimeType = normalizeMimeType(metadata.split(';', 1)[0], outputType)
    const buffer = metadata.split(';').includes('base64')
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload))
    if (!buffer.byteLength || buffer.byteLength > maximumGeneratedMediaBytes) {
      throw new Error('Generated media must be between 1 byte and 50 MB to save locally.')
    }

    return {
      buffer,
      mimetype: mimeType,
      name: `generated.${extensionFor(mimeType)}`,
      size: buffer.byteLength,
    }
  }

  const sourceURL = new URL(resolveMediaUrl(source))
  const siteURL = new URL(
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
  )
  const isOwnMediaRoute =
    sourceURL.origin === siteURL.origin && sourceURL.pathname.startsWith('/api/media/file/')
  const gatewayBase =
    provider === 'muse2api'
      ? process.env.APP_MUSE2API_BASE_URL
      : provider === 'chatgpt2api'
        ? process.env.APP_CHATGPT2API_BASE_URL
        : undefined
  let isTrustedGatewayMedia = false
  if (gatewayBase) {
    const gatewayURL = new URL(gatewayBase)
    const mediaPrefix = `${gatewayURL.pathname.replace(/\/+$/, '')}/media/`
    isTrustedGatewayMedia =
      sourceURL.origin === gatewayURL.origin && sourceURL.pathname.startsWith(mediaPrefix)
  }
  const downloaded =
    isOwnMediaRoute || isTrustedGatewayMedia
      ? await (async () => {
          const response = await fetch(sourceURL, {
            signal: AbortSignal.timeout(120_000),
            redirect: 'error',
          })
          if (!response.ok)
            throw new Error('Generated media could not be downloaded for local storage.')
          const buffer = await collectResponseBody(
            response.body as unknown as AsyncIterable<Uint8Array> | null,
            Number(response.headers.get('content-length')),
          )
          return { buffer, contentType: response.headers.get('content-type') }
        })()
      : await downloadExternal(sourceURL)

  const mimeType = normalizeMimeType(downloaded.contentType, outputType)
  const buffer = downloaded.buffer
  if (!buffer.byteLength || buffer.byteLength > maximumGeneratedMediaBytes) {
    throw new Error('Generated media must be between 1 byte and 50 MB to save locally.')
  }

  return {
    buffer,
    mimetype: mimeType,
    name: `generated.${extensionFor(mimeType)}`,
    size: buffer.byteLength,
  }
}

export function downloadGeneratedMedia(
  source: string,
  outputType: 'image' | 'video' | 'audio',
  provider?: string,
) {
  return downloadMedia(source, outputType, provider)
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export class WorkflowMediaPersister implements WorkflowOutputPersister {
  constructor(private readonly assetService: AssetService) {}

  async persist(
    workflowId: string,
    executionId: string,
    node: WorkflowNode,
    outputs: Record<string, NodeValue>,
    provenance?: { sourceGenerationId?: string },
  ): Promise<WorkflowOutputPersistenceResult> {
    if (!generatedMediaNodeTypes.has(node.type)) return { outputs }

    const persistedOutputs = { ...outputs }
    const warnings: string[] = []
    const safeNodeId = safeFilenamePart(node.slug || node.id) || 'generated-media'
    const safeExecutionId = safeFilenamePart(executionId).slice(0, 12) || 'run'

    for (const [portId, output] of Object.entries(outputs)) {
      if (output.type !== 'image' && output.type !== 'video' && output.type !== 'audio') continue
      if (output.assetId || output.metadata?.assetId) continue

      try {
        const source = getMediaUrl(output.value)
        if (!source) throw new Error('Generated media has no URL or data.')
        const file = await downloadMedia(source, output.type, String(node.config.provider || ''))
        const extension = extensionFor(file.mimetype)
        const filename = `${safeNodeId}-${safeExecutionId}-${safeFilenamePart(portId) || output.type}.${extension}`
        const sourceGenerationId = provenance?.sourceGenerationId
        const asset = await this.assetService.uploadAsset({
          alt: sourceGenerationId
            ? `${node.name} output from Studio generation ${sourceGenerationId}`
            : `${node.name} output from workflow ${workflowId}`,
          file: { ...file, name: filename },
          source: sourceGenerationId ? 'studio' : 'workflow',
          ...(sourceGenerationId ? { sourceGeneration: sourceGenerationId } : {}),
          ...(!sourceGenerationId
            ? { sourceWorkflow: workflowId, sourceExecution: executionId }
            : {}),
        })
        const currentValue = isRecord(output.value)
          ? output.value
          : { url: typeof output.value === 'string' ? output.value : '' }
        const url =
          asset.url ||
          (asset.filename ? `/api/media/file/${encodeURIComponent(asset.filename)}` : '')

        persistedOutputs[portId] = {
          ...output,
          assetId: asset.id,
          value: {
            ...currentValue,
            ...(url ? { url } : {}),
            assetId: asset.id,
            filename: asset.filename || filename,
            mimeType: asset.mimeType || file.mimetype,
          },
          metadata: {
            ...output.metadata,
            assetId: asset.id,
            filename: asset.filename || filename,
            mimeType: asset.mimeType || file.mimetype,
            savedToAssets: true,
          },
        }
      } catch {
        const warning = `Could not save ${output.type} output from ${node.name} to Assets; the provider URL may expire.`
        warnings.push(warning)
        persistedOutputs[portId] = {
          ...output,
          metadata: {
            ...output.metadata,
            saveWarning: warning,
          },
        }
      }
    }

    return { outputs: persistedOutputs, warnings }
  }
}

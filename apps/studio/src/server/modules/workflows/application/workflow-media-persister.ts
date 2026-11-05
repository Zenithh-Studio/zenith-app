import type { NodeValue, WorkflowNode } from '@znith/contracts'
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
])

const maximumGeneratedMediaBytes = 50 * 1024 * 1024

type MediaFile = {
  buffer: Buffer
  mimetype: string
  name: string
  size: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMediaUrl(value: unknown) {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.url === 'string') return value.url
  return ''
}

function defaultMimeType(type: NodeValue['type']) {
  return type === 'video' ? 'video/mp4' : 'image/png'
}

function normalizeMimeType(value: string | null | undefined, type: NodeValue['type']) {
  const expectedPrefix = type === 'video' ? 'video/' : 'image/'
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

async function downloadMedia(source: string, outputType: 'image' | 'video'): Promise<MediaFile> {
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

  const response = await fetch(resolveMediaUrl(source), {
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error('Generated media could not be downloaded for local storage.')

  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumGeneratedMediaBytes) {
    throw new Error('Generated media is larger than the 50 MB local storage limit.')
  }

  const mimeType = normalizeMimeType(response.headers.get('content-type'), outputType)
  const buffer = Buffer.from(await response.arrayBuffer())
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
  ): Promise<WorkflowOutputPersistenceResult> {
    if (!generatedMediaNodeTypes.has(node.type)) return { outputs }

    const persistedOutputs = { ...outputs }
    const warnings: string[] = []
    const safeNodeId = safeFilenamePart(node.slug || node.id) || 'generated-media'
    const safeExecutionId = safeFilenamePart(executionId).slice(0, 12) || 'run'

    for (const [portId, output] of Object.entries(outputs)) {
      if (output.type !== 'image' && output.type !== 'video') continue
      if (output.assetId || output.metadata?.assetId) continue

      try {
        const source = getMediaUrl(output.value)
        if (!source) throw new Error('Generated media has no URL or data.')
        const file = await downloadMedia(source, output.type)
        const extension = extensionFor(file.mimetype)
        const filename = `${safeNodeId}-${safeExecutionId}-${safeFilenamePart(portId) || output.type}.${extension}`
        const asset = await this.assetService.uploadAsset({
          alt: `${node.name} output from workflow ${workflowId}`,
          file: { ...file, name: filename },
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

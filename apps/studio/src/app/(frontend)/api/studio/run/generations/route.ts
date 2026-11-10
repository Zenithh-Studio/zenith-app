import { modelResolutionOptions, providersFor, registryByType } from '@znith/contracts'
import type { NodeValue, WorkflowNode } from '@znith/contracts'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { z } from 'zod'
import { withApiLogging } from '@/lib/server-logger'
import { withProviderCredentials } from '@/server/modules/providers/credential-context'
import { runStudioNode } from '@/server/modules/workflows/infrastructure/engine'

const requestSchema = z
  .object({
    modality: z.enum(['image', 'video', 'audio']),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    aspectRatio: z.string().optional(),
    quality: z.enum(['draft', 'standard', 'high']).optional(),
    duration: z.number().positive().optional(),
    resolution: z.enum(['480p', '720p', '1080p', '1k', '2k', '4k', 'auto']).optional(),
    size: z
      .string()
      .regex(/^[1-9]\d*x[1-9]\d*$/)
      .optional(),
    count: z.number().int().min(1).max(15).optional(),
    generateAudio: z.boolean().optional(),
    voice: z
      .enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'])
      .optional(),
    format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
    speed: z.number().optional(),
    instructions: z.string().optional(),
    referenceAssetIds: z.array(z.string().min(1)).optional(),
    references: z
      .array(
        z.object({
          id: z.string().optional(),
          type: z.enum(['image', 'video']),
          value: z.unknown(),
          metadata: z.record(z.string(), z.unknown()).optional(),
          assetId: z.string().optional(),
        }),
      )
      .optional(),
    credentials: z
      .object({
        keys: z.record(z.string(), z.string()).optional(),
        baseUrls: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  })
  .strict()

type Input = z.infer<typeof requestSchema>

function generationNode(input: Input): WorkflowNode {
  const type =
    input.modality === 'image'
      ? 'ai.generate-image'
      : input.modality === 'video'
        ? 'ai.generate-video'
        : 'ai.generate-audio'
  const definition = registryByType.get(type)
  if (!definition?.available) throw new Error('This generation type is not available.')
  const config: Record<string, unknown> = {
    ...definition.defaultConfig,
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.duration ? { duration: input.duration } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.count ? { count: input.count } : {}),
    ...(input.generateAudio !== undefined ? { generateAudio: input.generateAudio } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.speed !== undefined ? { speed: input.speed } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
  }
  return {
    id: `studio-${input.modality}`,
    type,
    name: `${input.modality[0]!.toUpperCase()}${input.modality.slice(1)} Studio`,
    slug: `studio-${input.modality}`,
    position: { x: 0, y: 0 },
    config,
  }
}

function outputFileName(type: string, mimeType: string, index: number) {
  const extension = mimeType.split('/')[1]?.split(';')[0] || (type === 'video' ? 'mp4' : 'png')
  return `zenith-${type}-${String(index + 1).padStart(2, '0')}.${extension}`
}

function privateAddress(address: string) {
  if (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:')
  )
    return true
  const octets = address.split('.').map(Number)
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      octets[0] === 0)
  )
}

async function inlineOutput(value: unknown, mimeType: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (typeof record.url !== 'string' || record.url.startsWith('data:')) return value
  let url: URL
  try {
    url = new URL(record.url)
  } catch {
    return value
  }
  if (url.protocol !== 'https:') return value
  const addressType = isIP(url.hostname)
  const addresses = addressType
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) return value
  const response = await fetch(url, {
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  }).catch(() => null)
  if (!response?.ok) return value
  const contentType = response.headers.get('content-type')?.split(';', 1)[0] || mimeType
  const limit = contentType.startsWith('video/') ? 150 * 1024 * 1024 : 40 * 1024 * 1024
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > limit) return value
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > limit) return value
  return {
    ...record,
    url: `data:${contentType};base64,${bytes.toString('base64')}`,
    mimeType: contentType,
    bytes: bytes.byteLength,
  }
}

function publicError(error: unknown) {
  return (error instanceof Error ? error.message : 'Generation failed.')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
    .slice(0, 2000)
}

async function run(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success)
    return Response.json(
      { error: 'Enter a prompt and supported generation settings.' },
      { status: 400 },
    )
  const input = parsed.data
  const provider = providersFor(input.modality).find((item) => item.id === input.provider)
  if (!provider || !provider.models[input.modality]?.includes(input.model)) {
    return Response.json(
      { error: 'Choose a provider and model that support this generation type.' },
      { status: 400 },
    )
  }
  if (
    input.aspectRatio &&
    !['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9'].includes(input.aspectRatio)
  ) {
    return Response.json({ error: 'Choose a supported aspect ratio.' }, { status: 400 })
  }
  if (
    input.modality === 'video' &&
    input.resolution &&
    !modelResolutionOptions(input.provider, input.model).includes(input.resolution)
  ) {
    return Response.json(
      { error: 'This model does not support the selected resolution.' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const generationId = crypto.randomUUID()
  const node = generationNode(input)
  const startedAt = Date.now()
  try {
    const inputs: Record<string, NodeValue[]> = {}
    for (const reference of input.references || []) {
      ;(inputs[reference.type] ||= []).push({
        type: reference.type,
        value: reference.value,
        ...(reference.id ? { assetId: reference.id } : {}),
        ...(reference.metadata ? { metadata: reference.metadata } : {}),
      })
    }
    const outputs = await withProviderCredentials(
      {
        keys: input.credentials?.keys as never,
        baseUrls: input.credentials?.baseUrls as never,
      },
      () => runStudioNode(node, inputs),
    )
    const outputAssets = await Promise.all(
      Object.entries(outputs)
        .filter(([, value]) => ['image', 'video', 'audio'].includes(value.type))
        .map(async ([key, value], index) => {
          const data =
            value.value && typeof value.value === 'object'
              ? (value.value as Record<string, unknown>)
              : { url: value.value }
          const mimeType = String(
            data.mimeType ||
              (value.type === 'video'
                ? 'video/mp4'
                : value.type === 'audio'
                  ? 'audio/mpeg'
                  : 'image/png'),
          )
          const mediaData = (await inlineOutput(data, mimeType)) as Record<string, unknown>
          return {
            relationTo: 'media',
            value: {
              id: `${generationId}:${key}`,
              url: typeof mediaData.url === 'string' ? mediaData.url : '',
              filename: String(mediaData.fileName || outputFileName(value.type, mimeType, index)),
              mimeType: String(mediaData.mimeType || mimeType),
              filesize: Number(mediaData.bytes || 0),
              alt: input.prompt,
              source: 'studio',
              createdAt: now,
            },
          }
        }),
    )
    const generation = {
      id: generationId,
      modality: input.modality,
      status: 'succeeded',
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      inputSnapshot: { node, referenceAssetIds: input.referenceAssetIds || [] },
      outputs: outputAssets,
      durationMs: Date.now() - startedAt,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    }
    return Response.json({ generation }, { status: 201 })
  } catch (error) {
    const message = publicError(error)
    const generation = {
      id: generationId,
      modality: input.modality,
      status: 'failed',
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      inputSnapshot: { node, referenceAssetIds: input.referenceAssetIds || [] },
      outputs: [],
      error,
      errorCode: /credential|api key|not configured/i.test(message)
        ? 'PROVIDER_KEY_MISSING'
        : 'GENERATION_FAILED',
      durationMs: Date.now() - startedAt,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    }
    return Response.json({ generation, error: message }, { status: 422 })
  }
}

export const POST = withApiLogging('/api/studio/run/generations', run)

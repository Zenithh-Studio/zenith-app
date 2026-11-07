import {
  modelDurationOptions,
  modelResolutionOptions,
  providersFor,
  registryByType,
} from '@znith/contracts'
import type { NodeValue, WorkflowNode } from '@znith/contracts'
import { z } from 'zod'
import { appUserRole, getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getAssetService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'
import {
  loadProviderCredentials,
  type PayloadSettingsApi,
} from '@/server/modules/providers/user-settings'
import { withProviderCredentials } from '@/server/modules/providers/credential-context'
import { runStudioNode } from '@/server/modules/workflows/infrastructure/engine'
import { WorkflowMediaPersister } from '@/server/modules/workflows/application/workflow-media-persister'
import { markStudioGenerationRun } from '@/server/modules/studio/refresh-video-generation'

const generationSchema = z
  .object({
    modality: z.enum(['image', 'video', 'audio']),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    aspectRatio: z.string().optional(),
    quality: z.enum(['draft', 'standard', 'high']).optional(),
    duration: z.number().positive().optional(),
    resolution: z.enum(['480p', '720p', '1080p']).optional(),
    generateAudio: z.boolean().optional(),
    voice: z
      .enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'])
      .optional(),
    format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
    speed: z.number().optional(),
    instructions: z.string().optional(),
    referenceAssetIds: z.array(z.string().min(1)).optional(),
    retryOf: z.string().min(1).optional(),
  })
  .strict()

type StudioGenerationRequest = z.infer<typeof generationSchema>
type AppUser = NonNullable<Awaited<ReturnType<typeof getAppSession>>>['user']

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Generation failed.'
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
    .replace(/(api[_-]?key|token|authorization)(["'\s:=]+)[^\s,"'<>}]+/gi, '$1$2[credential]')
}

function errorCode(message: string) {
  if (/credential|api key|not configured/i.test(message)) return 'PROVIDER_KEY_MISSING'
  if (/\b(401|403)\b|unauthorized|forbidden/i.test(message)) return 'PROVIDER_AUTH'
  if (/\b429\b|rate limit/i.test(message)) return 'PROVIDER_RATE_LIMIT'
  if (/timeout|timed out/i.test(message)) return 'PROVIDER_TIMEOUT'
  return 'GENERATION_FAILED'
}

function generationNode(input: StudioGenerationRequest): WorkflowNode {
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
    ...(input.generateAudio !== undefined ? { generateAudio: input.generateAudio } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.speed !== undefined ? { speed: input.speed } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
  }
  return {
    id: `studio-${input.modality}`,
    type,
    name: `${input.modality[0].toUpperCase()}${input.modality.slice(1)} Studio`,
    slug: `studio-${input.modality}`,
    position: { x: 0, y: 0 },
    config,
  }
}

function mediaValue(
  asset: {
    id: string
    url?: string | null
    filename?: string | null
    mimeType?: string | null
  },
  type: 'image' | 'video',
): NodeValue {
  const url =
    asset.url || (asset.filename ? `/api/media/file/${encodeURIComponent(asset.filename)}` : '')
  if (!url) throw new Error('A selected asset has no available file URL.')
  return {
    type,
    value: { url, fileName: asset.filename || '', mimeType: asset.mimeType || undefined },
    assetId: asset.id,
    metadata: { filename: asset.filename || '', mimeType: asset.mimeType || undefined },
  }
}

async function generate(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  user: AppUser,
  input: StudioGenerationRequest,
) {
  if (['chatgpt2api', 'muse2api'].includes(input.provider) && appUserRole(user) !== 'admin') {
    throw new Error('Shared gateways are available to administrators only.')
  }
  const provider = providersFor(input.modality).find((item) => item.id === input.provider)
  if (!provider || !provider.models[input.modality]?.includes(input.model)) {
    throw new Error('Choose a provider and model that support this generation type.')
  }
  if (input.modality === 'audio' && input.referenceAssetIds?.length) {
    throw new Error('Audio generation does not accept media references.')
  }
  const allowedAspectRatios = ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9']
  if (input.aspectRatio && !allowedAspectRatios.includes(input.aspectRatio)) {
    throw new Error('Choose a supported aspect ratio.')
  }
  if (input.modality === 'video') {
    if (
      input.duration &&
      !modelDurationOptions(input.provider, input.model).includes(input.duration)
    ) {
      throw new Error('This model does not support the selected duration.')
    }
    if (
      input.resolution &&
      !modelResolutionOptions(input.provider, input.model).includes(input.resolution)
    ) {
      throw new Error('This model does not support the selected resolution.')
    }
  }

  const assetService = await getAssetService(user)
  const referenceIds = [...new Set(input.referenceAssetIds ?? [])]
  const references = referenceIds.length ? await assetService.findAssetsByIds(referenceIds) : []
  if (references.length !== referenceIds.length)
    throw new Error('One or more references are unavailable.')
  const supportsReferenceVideo =
    input.modality === 'video' &&
    input.provider === 'replicate' &&
    input.model === 'bytedance/seedance-2.5'
  const referenceVideos = references.filter((asset) => asset.mimeType?.startsWith('video/'))
  const referenceImages = references.filter((asset) => asset.mimeType?.startsWith('image/'))
  if (
    references.length !==
    referenceImages.length + (supportsReferenceVideo ? referenceVideos.length : 0)
  ) {
    throw new Error(
      supportsReferenceVideo
        ? 'Choose image or video references supported by this model.'
        : 'This model accepts image references only.',
    )
  }
  if (referenceVideos.length > 1 || (referenceVideos.length && referenceImages.length)) {
    throw new Error(
      'Seedance accepts either one reference video or image references, not both at once.',
    )
  }
  const node = generationNode(input)
  const settings = await loadProviderCredentials(payload as unknown as PayloadSettingsApi, user)
  const generation = await payload.create({
    collection: 'studio-generations',
    overrideAccess: false,
    data: {
      modality: input.modality,
      status: 'running',
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      inputSnapshot: {
        node,
        referenceAssetIds: referenceIds,
      },
      ...(referenceIds.length ? { references: referenceIds } : {}),
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
    },
    req: { user, context: { studioRuntime: true } },
  })
  const startedAt = Date.now()
  let providerTaskId: string | undefined
  if (input.modality === 'video') markStudioGenerationRun(String(generation.id), true)

  try {
    const inputs: Record<string, NodeValue[]> = {}
    if (referenceImages.length)
      inputs.image = referenceImages.map((asset) => mediaValue(asset, 'image'))
    if (referenceVideos.length)
      inputs.video = referenceVideos.map((asset) => mediaValue(asset, 'video'))
    const outputs = await withProviderCredentials(settings, () =>
      runStudioNode(node, inputs, {
        onProviderTask: async (_nodeId, task) => {
          providerTaskId = task.taskId
          await payload.update({
            collection: 'studio-generations',
            id: generation.id,
            overrideAccess: false,
            data: {
              status: 'pending',
              providerTaskId: task.taskId,
              lastPolledAt: new Date().toISOString(),
            },
            req: { user, context: { studioRuntime: true } },
          })
        },
      }),
    )
    const persisted = await new WorkflowMediaPersister(assetService).persist(
      'studio',
      String(generation.id),
      node,
      outputs,
      { sourceGenerationId: String(generation.id) },
    )
    const outputAssets = Object.values(persisted.outputs)
      .filter((value) => value.type === 'image' || value.type === 'video' || value.type === 'audio')
      .map((value) => value.assetId || value.metadata?.assetId)
      .filter((id): id is string => typeof id === 'string')
    if (!outputAssets.length) {
      const warning =
        persisted.warnings?.[0] || 'The provider returned no persistable media output.'
      const updated = await payload.update({
        collection: 'studio-generations',
        id: generation.id,
        overrideAccess: false,
        data: {
          status: 'succeeded',
          error: warning,
          durationMs: Date.now() - startedAt,
        },
        req: { user, context: { studioRuntime: true } },
      })
      return { generation: updated, saved: false, warning }
    }
    const updated = await payload.update({
      collection: 'studio-generations',
      id: generation.id,
      overrideAccess: false,
      data: {
        status: 'succeeded',
        outputs: outputAssets.map((value) => ({ relationTo: 'media', value })),
        durationMs: Date.now() - startedAt,
        ...(persisted.warnings?.length ? { error: persisted.warnings.join(' ') } : {}),
      },
      req: { user, context: { studioRuntime: true } },
    })
    return { generation: updated, saved: true, warning: persisted.warnings?.[0] }
  } catch (error) {
    const message = publicError(error)
    const updated = await payload.update({
      collection: 'studio-generations',
      id: generation.id,
      overrideAccess: false,
      data: {
        status: providerTaskId ? 'interrupted' : 'failed',
        errorCode: providerTaskId ? 'PROVIDER_TASK_INTERRUPTED' : errorCode(message),
        error: message,
        durationMs: Date.now() - startedAt,
      },
      req: { user, context: { studioRuntime: true } },
    })
    return { generation: updated, saved: false, error: message }
  } finally {
    if (input.modality === 'video') markStudioGenerationRun(String(generation.id), false)
  }
}

async function retryGeneration(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  user: AppUser,
  retryOf: string,
) {
  const previous = await payload.findByID({
    collection: 'studio-generations',
    id: retryOf,
    overrideAccess: false,
    depth: 0,
    req: { user },
  })
  const snapshot = previous.inputSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('This generation does not have a retryable input snapshot.')
  }
  const stored = snapshot as { node?: WorkflowNode; referenceAssetIds?: string[] }
  const node = stored.node
  if (
    !node?.config ||
    (previous.modality !== 'image' &&
      previous.modality !== 'video' &&
      previous.modality !== 'audio')
  ) {
    throw new Error('This generation does not have a retryable input snapshot.')
  }
  const config = node.config
  const parsed = generationSchema.safeParse({
    modality: previous.modality,
    provider: config.provider,
    model: config.model,
    prompt: config.prompt,
    aspectRatio: config.aspectRatio,
    quality: config.quality,
    duration: config.duration,
    resolution: config.resolution,
    generateAudio: config.generateAudio,
    voice: config.voice,
    format: config.format,
    speed: config.speed,
    instructions: config.instructions,
    referenceAssetIds: stored.referenceAssetIds || [],
    retryOf: String(previous.id),
  })
  if (!parsed.success)
    throw new Error('This generation has invalid saved settings and cannot be retried.')
  return generate(payload, user, parsed.data)
}

async function listGenerations(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  try {
    const query = new URL(request.url).searchParams
    const modality = query.get('modality')
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'studio-generations',
      overrideAccess: false,
      depth: 1,
      limit: 100,
      sort: '-createdAt',
      ...(modality === 'image' || modality === 'video' || modality === 'audio'
        ? { where: { modality: { equals: modality } } }
        : {}),
      req: { user: session.user },
    })
    return Response.json({ generations: result.docs })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/generations')
  }
}

async function createGeneration(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid generation settings.', code: 'INVALID_GENERATION' },
      { status: 400 },
    )
  }
  const retry = z
    .object({ retryOf: z.string().min(1) })
    .strict()
    .safeParse(body)
  const parsed = generationSchema.safeParse(body)
  if (!retry.success && !parsed.success) {
    return Response.json(
      { error: 'Enter a prompt and supported generation settings.', code: 'INVALID_GENERATION' },
      { status: 400 },
    )
  }
  try {
    const payload = await getPayloadClient()
    const result = retry.success
      ? await retryGeneration(payload, session.user, retry.data.retryOf)
      : await generate(payload, session.user, parsed.data!)
    const status = 'error' in result ? 502 : result.saved ? 201 : 202
    return Response.json(result, { status })
  } catch (error) {
    const message = publicError(error)
    return Response.json({ error: message, code: errorCode(message) }, { status: 400 })
  }
}

export const GET = withApiLogging('/api/studio/generations', listGenerations)
export const POST = withApiLogging('/api/studio/generations', createGeneration)

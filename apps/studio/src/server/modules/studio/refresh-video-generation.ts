import 'server-only'

import type { AuthenticatedUser } from 'payload'
import type { NodeValue, WorkflowNode } from '@znith/contracts'
import { getAssetService } from '@/lib/backend-services'
import { getPayloadClient } from '@/lib/payload'
import { WorkflowMediaPersister } from '@/server/modules/workflows/application/workflow-media-persister'
import { checkMuse2APIVideoTask } from '@/server/modules/workflows/infrastructure/engine'
import {
  checkVideoGenerationTask,
  type VideoTaskCheck,
} from '@/server/modules/workflows/infrastructure/video-provider-adapters'
import {
  loadProviderCredentials,
  type PayloadSettingsApi,
} from '@/server/modules/providers/user-settings'
import { withProviderCredentials } from '@/server/modules/providers/credential-context'

type GenerationRecord = {
  id: string
  modality: 'image' | 'video' | 'audio'
  status: string
  provider: string
  model: string
  providerTaskId?: string | null
  inputSnapshot?: unknown
  outputs?: unknown[]
  error?: string | null
}

type GenerationPayload = {
  findByID(options: {
    collection: 'studio-generations'
    id: string
    overrideAccess: false
    depth: 1
    req: { user: AuthenticatedUser }
  }): Promise<GenerationRecord>
  update(options: {
    collection: 'studio-generations'
    id: string
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AuthenticatedUser; context: { studioRuntime: true } }
  }): Promise<GenerationRecord>
}

type Snapshot = { node?: WorkflowNode }
type RefreshResult = { generation: GenerationRecord; changed: boolean }

const activeRefreshes = new Map<string, Promise<RefreshResult>>()
const activeGenerationRuns = new Set<string>()

export function markStudioGenerationRun(id: string, active: boolean) {
  if (active) activeGenerationRuns.add(id)
  else activeGenerationRuns.delete(id)
}

export function isStudioGenerationRunActive(id: string) {
  return activeGenerationRuns.has(id)
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Video task status could not be checked.'
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
}

async function checkTask(provider: string, model: string, taskId: string): Promise<VideoTaskCheck> {
  if (provider === 'muse2api') return checkMuse2APIVideoTask(taskId)
  return checkVideoGenerationTask({ provider, model, taskId })
}

async function refresh(
  payload: GenerationPayload,
  user: AuthenticatedUser,
  id: string,
): Promise<RefreshResult> {
  const generation = await payload.findByID({
    collection: 'studio-generations',
    id,
    overrideAccess: false,
    depth: 1,
    req: { user },
  })
  if (generation.modality !== 'video')
    throw new Error('Only video generations have provider tasks.')
  if (activeGenerationRuns.has(id)) return { generation, changed: false }
  if (
    generation.status === 'succeeded' ||
    generation.status === 'failed' ||
    generation.status === 'cancelled'
  ) {
    return { generation, changed: false }
  }
  const taskId = generation.providerTaskId
  if (!taskId) throw new Error('This video generation has no saved provider task ID yet.')
  const snapshot = generation.inputSnapshot as Snapshot | undefined
  const node = snapshot?.node
  if (!node?.config || node.type !== 'ai.generate-video') {
    throw new Error('This generation does not have a valid video task snapshot.')
  }
  const settings = await loadProviderCredentials(payload as unknown as PayloadSettingsApi, user)
  const check = await withProviderCredentials(settings, () =>
    checkTask(generation.provider, generation.model, taskId),
  )
  const polledAt = new Date().toISOString()

  if (check.status === 'pending') {
    const updated = await payload.update({
      collection: 'studio-generations',
      id,
      overrideAccess: false,
      data: { status: 'pending', lastPolledAt: polledAt, error: null, errorCode: null },
      req: { user, context: { studioRuntime: true } },
    })
    return { generation: updated, changed: true }
  }

  if (check.status === 'failed' || check.status === 'cancelled') {
    const updated = await payload.update({
      collection: 'studio-generations',
      id,
      overrideAccess: false,
      data: {
        status: check.status,
        lastPolledAt: polledAt,
        errorCode:
          check.status === 'cancelled' ? 'PROVIDER_TASK_CANCELLED' : 'PROVIDER_TASK_FAILED',
        error: safeError(new Error(check.error || `Provider task ${check.status}.`)),
      },
      req: { user, context: { studioRuntime: true } },
    })
    return { generation: updated, changed: true }
  }

  if (!check.url) throw new Error('The provider reported success without a video URL.')
  const assetService = await getAssetService(user)
  const output: NodeValue = {
    type: 'video',
    value: { url: check.url },
    metadata: { provider: generation.provider, model: generation.model, providerJobId: taskId },
  }
  const persisted = await new WorkflowMediaPersister(assetService).persist(
    'studio',
    id,
    node,
    { video: output },
    { sourceGenerationId: id },
  )
  const saved = persisted.outputs.video
  const assetId = saved?.assetId || saved?.metadata?.assetId
  if (typeof assetId !== 'string') {
    const updated = await payload.update({
      collection: 'studio-generations',
      id,
      overrideAccess: false,
      data: {
        status: 'failed',
        lastPolledAt: polledAt,
        errorCode: 'MEDIA_SAVE_FAILED',
        error:
          persisted.warnings?.[0] || 'The video finished, but it could not be saved to Assets.',
      },
      req: { user, context: { studioRuntime: true } },
    })
    return { generation: updated, changed: true }
  }
  const updated = await payload.update({
    collection: 'studio-generations',
    id,
    overrideAccess: false,
    data: {
      status: 'succeeded',
      lastPolledAt: polledAt,
      outputs: [{ relationTo: 'media', value: assetId }],
      ...(persisted.warnings?.length ? { error: persisted.warnings.join(' ') } : { error: null }),
      errorCode: null,
    },
    req: { user, context: { studioRuntime: true } },
  })
  return { generation: updated, changed: true }
}

export async function refreshVideoGeneration(user: AuthenticatedUser, id: string) {
  const key = `${String(user.id)}:${id}`
  const existing = activeRefreshes.get(key)
  if (existing) return existing
  const pending = (async () => {
    const payload = (await getPayloadClient()) as unknown as GenerationPayload
    return refresh(payload, user, id)
  })()
  activeRefreshes.set(key, pending)
  try {
    return await pending
  } finally {
    activeRefreshes.delete(key)
  }
}

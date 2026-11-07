import {
  AssetService,
  PayloadAssetRepository,
  createPayloadAssetReferenceCleaner,
  PayloadWorkflowRepository,
  WorkflowMediaPersister,
  WorkflowService,
  checkMuse2APIVideoTask,
  runWorkflow,
} from '@/server'
import type { PayloadLocalApi } from '@/server/modules/workflows'
import type { PayloadMediaApi } from '@/server/modules/assets'
import { getPayloadClient } from './payload'
import type { AuthenticatedUser } from 'payload'
import {
  loadProviderCredentials,
  type PayloadSettingsApi,
} from '@/server/modules/providers/user-settings'
import { withProviderCredentials } from '@/server/modules/providers/credential-context'
import { checkVideoGenerationTask } from '@/server/modules/workflows/infrastructure/video-provider-adapters'

export async function getWorkflowService(user: AuthenticatedUser) {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadWorkflowRepository(
    payloadClient as unknown as PayloadLocalApi,
    user,
  )
  const mediaRepository = new PayloadAssetRepository(
    payloadClient as unknown as PayloadMediaApi,
    user,
  )
  const assetService = new AssetService(mediaRepository)
  const providerCredentials = await loadProviderCredentials(
    payloadClient as unknown as PayloadSettingsApi,
    user,
  )
  return new WorkflowService(
    repository,
    (definition, targetNodeId, options) =>
      withProviderCredentials(providerCredentials, () =>
        runWorkflow(definition, targetNodeId, options),
      ),
    undefined,
    new WorkflowMediaPersister(assetService),
    (task) =>
      withProviderCredentials(providerCredentials, () => {
        if (task.provider === 'muse2api') return checkMuse2APIVideoTask(task.taskId)
        if (['replicate', 'gemini', 'runway'].includes(task.provider)) {
          return checkVideoGenerationTask(task)
        }
        throw new Error(`Video task polling is not supported for ${task.provider}.`)
      }),
  )
}

export async function getAssetService(user: AuthenticatedUser) {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadAssetRepository(payloadClient as unknown as PayloadMediaApi, user)
  const cleaner = createPayloadAssetReferenceCleaner(
    payloadClient as unknown as PayloadLocalApi,
    user,
  )
  return new AssetService(repository, cleaner)
}

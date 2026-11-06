import {
  AssetService,
  PayloadAssetRepository,
  createPayloadAssetReferenceCleaner,
  PayloadWorkflowRepository,
  WorkflowMediaPersister,
  WorkflowService,
  runWorkflow,
} from '@/server'
import type { PayloadLocalApi } from '@/server/modules/workflows'
import type { PayloadMediaApi } from '@/server/modules/assets'
import { getPayloadClient } from './payload'

export async function getWorkflowService() {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadWorkflowRepository(payloadClient as unknown as PayloadLocalApi)
  const mediaRepository = new PayloadAssetRepository(payloadClient as unknown as PayloadMediaApi)
  const assetService = new AssetService(mediaRepository)
  return new WorkflowService(
    repository,
    runWorkflow,
    undefined,
    new WorkflowMediaPersister(assetService),
  )
}

export async function getAssetService() {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadAssetRepository(payloadClient as unknown as PayloadMediaApi)
  const cleaner = createPayloadAssetReferenceCleaner(payloadClient as unknown as PayloadLocalApi)
  return new AssetService(repository, cleaner)
}

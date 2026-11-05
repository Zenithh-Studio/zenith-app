import {
  AssetService,
  PayloadAssetRepository,
  PayloadWorkflowRepository,
  WorkflowMediaPersister,
  WorkflowService,
  runWorkflow,
} from '@znith/be'
import type { PayloadLocalApi } from '@znith/be/workflows'
import type { PayloadMediaApi } from '@znith/be/assets'
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
  return new AssetService(repository)
}

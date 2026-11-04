import {
  AssetService,
  PayloadAssetRepository,
  PayloadWorkflowRepository,
  WorkflowService,
  runWorkflow,
} from '@znith/be'
import type { PayloadLocalApi } from '@znith/be/workflows'
import type { PayloadMediaApi } from '@znith/be/assets'
import { getPayloadClient } from './payload'

export async function getWorkflowService() {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadWorkflowRepository(payloadClient as unknown as PayloadLocalApi)
  return new WorkflowService(repository, runWorkflow)
}

export async function getAssetService() {
  const payloadClient = await getPayloadClient()
  const repository = new PayloadAssetRepository(payloadClient as unknown as PayloadMediaApi)
  return new AssetService(repository)
}

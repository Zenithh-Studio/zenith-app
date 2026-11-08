import type { AssetReferenceCleaner } from '../domain/asset-repository'
import type { PayloadLocalApi } from '../../workflows/infrastructure/payload-workflow-repository'
import { WorkflowAssetReferenceCleaner } from '../../workflows/application/workflow-asset-reference-cleaner'
import { PayloadWorkflowRepository } from '../../workflows/infrastructure/payload-workflow-repository'
import type { AuthenticatedUser } from 'payload'

export function createPayloadAssetReferenceCleaner(
  payloadClient: PayloadLocalApi,
  user: AuthenticatedUser,
) {
  const workflows = new WorkflowAssetReferenceCleaner(
    new PayloadWorkflowRepository(payloadClient, user),
  )
  const cleaner: AssetReferenceCleaner = {
    clearAssetReferences: (assetIds) => workflows.clearAssetReferences(assetIds),
  }
  return cleaner
}

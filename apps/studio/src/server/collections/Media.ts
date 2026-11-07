import type { CollectionConfig } from 'payload'
import path from 'node:path'

import { createFolderField, createTagField } from 'payload'
import type { PayloadLocalApi } from '../modules/workflows'
import { createPayloadAssetReferenceCleaner } from '../modules/assets/infrastructure/payload-asset-reference-cleaner'
import { mediaServiceWriteAccess, ownerAccess, setDocumentOwner } from './access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: mediaServiceWriteAccess,
    delete: mediaServiceWriteAccess,
    read: ownerAccess,
    update: mediaServiceWriteAccess,
  },
  hooks: {
    beforeChange: [({ data, req }) => setDocumentOwner({ data, req })],
    beforeDelete: [
      async ({ id, req }) => {
        if (req.context?.assetReferencesCleared === true) return
        const cleaner = createPayloadAssetReferenceCleaner(
          req.payload as unknown as PayloadLocalApi,
          req.user as NonNullable<typeof req.user>,
        )
        await cleaner.clearAssetReferences([String(id)])
      },
    ],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    { name: 'title', type: 'text' },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
    { name: 'source', type: 'select', options: ['upload', 'workflow', 'studio', 'derived'] },
    { name: 'sourceWorkflow', type: 'relationship', relationTo: 'workflows' },
    { name: 'sourceExecution', type: 'relationship', relationTo: 'executions' },
    { name: 'sourceGeneration', type: 'relationship', relationTo: 'studio-generations' },
    { name: 'derivedFrom', type: 'relationship', relationTo: 'media' },
    { name: 'derivedMetadata', type: 'json' },
  ],
  upload: {
    staticDir: process.env.PAYLOAD_UPLOAD_DIR?.trim()
      ? path.resolve(process.env.PAYLOAD_UPLOAD_DIR.trim())
      : path.resolve(process.cwd(), 'uploads'),
    mimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
  },
}

import type { CollectionConfig } from 'payload'
import path from 'node:path'

import { createFolderField, createTagField } from 'payload'
import type { PayloadLocalApi } from '../modules/workflows'
import { createPayloadAssetReferenceCleaner } from '../modules/assets/infrastructure/payload-asset-reference-cleaner'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        if (req.context?.assetReferencesCleared === true) return
        const cleaner = createPayloadAssetReferenceCleaner(
          req.payload as unknown as PayloadLocalApi,
        )
        await cleaner.clearAssetReferences([String(id)])
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    staticDir: process.env.PAYLOAD_UPLOAD_DIR?.trim()
      ? path.resolve(process.env.PAYLOAD_UPLOAD_DIR.trim())
      : path.resolve(process.cwd(), 'uploads'),
    mimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
  },
}

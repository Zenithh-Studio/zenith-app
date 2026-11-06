import type { CollectionConfig } from 'payload'
import path from 'node:path'

import { createFolderField, createTagField } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: () => true,
    read: () => true,
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

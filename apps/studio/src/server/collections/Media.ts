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
    staticDir: path.resolve(process.cwd(), 'uploads'),
    mimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
  },
}

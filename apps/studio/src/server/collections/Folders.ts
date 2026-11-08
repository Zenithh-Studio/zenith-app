import type { CollectionConfig } from 'payload'
import { adminOnly } from './access'

export const Folders: CollectionConfig = {
  slug: 'folders',
  access: { create: adminOnly, delete: adminOnly, read: adminOnly, update: adminOnly },
  admin: {
    useAsTitle: 'name',
  },
  folders: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}

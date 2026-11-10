import type { CollectionConfig } from 'payload'
import { adminOnly } from './access'

export const Tags: CollectionConfig = {
  slug: 'tags',
  versions: false,
  access: { create: adminOnly, delete: adminOnly, read: adminOnly, update: adminOnly },
  admin: {
    useAsTitle: 'name',
  },
  tags: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}

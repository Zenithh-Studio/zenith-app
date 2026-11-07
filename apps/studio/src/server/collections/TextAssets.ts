import type { CollectionConfig } from 'payload'
import { ownerAccess, ownerCreateAccess, setDocumentOwner } from './access'

export const TextAssets: CollectionConfig = {
  slug: 'text-assets',
  admin: { group: 'Znith Studio', useAsTitle: 'title' },
  access: {
    create: ownerCreateAccess,
    delete: ownerAccess,
    read: ownerAccess,
    update: ownerAccess,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        const withOwner = setDocumentOwner({ data, req })
        const content =
          typeof withOwner.content === 'string' ? withOwner.content : originalDoc?.content
        return typeof content === 'string'
          ? { ...withOwner, sizeBytes: Buffer.byteLength(content, 'utf8') }
          : withOwner
      },
    ],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'textarea', required: true },
    {
      name: 'sizeBytes',
      type: 'number',
      index: true,
      access: { create: () => false, update: () => false },
    },
    { name: 'source', type: 'text' },
    { name: 'sourceId', type: 'text' },
    { name: 'metadata', type: 'json' },
  ],
  timestamps: true,
}

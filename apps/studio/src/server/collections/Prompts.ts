import type { CollectionConfig } from 'payload'
import { ownerAccess, ownerCreateAccess, setDocumentOwner } from './access'

export const Prompts: CollectionConfig = {
  slug: 'prompts',
  versions: false,
  indexes: [{ fields: ['owner', 'updatedAt'] }],
  admin: {
    group: 'Znith Studio',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'updatedAt'],
  },
  access: {
    create: ownerCreateAccess,
    delete: ownerAccess,
    read: ownerAccess,
    update: ownerAccess,
  },
  hooks: {
    beforeChange: [({ data, req }) => setDocumentOwner({ data, req })],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'content', type: 'textarea', required: true },
    { name: 'category', type: 'text' },
    { name: 'tags', type: 'json', defaultValue: [] },
  ],
  timestamps: true,
}

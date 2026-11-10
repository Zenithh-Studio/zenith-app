import type { CollectionConfig } from 'payload'

export const AdminSetup: CollectionConfig = {
  slug: 'admin-setup',
  versions: false,
  admin: { hidden: true },
  access: {
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  fields: [
    { name: 'setupKey', type: 'text', required: true, unique: true },
    { name: 'claimedBy', type: 'relationship', relationTo: 'users', required: true },
  ],
  timestamps: true,
}

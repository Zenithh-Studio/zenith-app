import type { CollectionConfig } from 'payload'
import { isAppUser, studioRuntimeOwnerAccess, ownerAccess, setDocumentOwner } from './access'

export const StudioGenerations: CollectionConfig = {
  slug: 'studio-generations',
  admin: { group: 'Znith Studio', hidden: true, useAsTitle: 'id' },
  access: {
    create: ({ req }) => isAppUser(req.user) && req.context?.studioRuntime === true,
    delete: ownerAccess,
    read: ownerAccess,
    update: studioRuntimeOwnerAccess,
  },
  hooks: {
    beforeChange: [({ data, req }) => setDocumentOwner({ data, req })],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    { name: 'modality', type: 'select', required: true, options: ['image', 'video', 'audio'] },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['queued', 'running', 'pending', 'succeeded', 'failed', 'interrupted', 'cancelled'],
    },
    { name: 'prompt', type: 'textarea' },
    { name: 'provider', type: 'text', required: true },
    { name: 'model', type: 'text', required: true },
    { name: 'inputSnapshot', type: 'json' },
    { name: 'references', type: 'relationship', relationTo: 'media', hasMany: true },
    { name: 'outputs', type: 'relationship', relationTo: ['media', 'text-assets'], hasMany: true },
    { name: 'providerTaskId', type: 'text' },
    { name: 'lastPolledAt', type: 'date' },
    { name: 'retryOf', type: 'relationship', relationTo: 'studio-generations' },
    { name: 'errorCode', type: 'text' },
    { name: 'error', type: 'textarea' },
    { name: 'durationMs', type: 'number' },
  ],
  timestamps: true,
}

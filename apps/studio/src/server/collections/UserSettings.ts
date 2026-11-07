import type { CollectionConfig } from 'payload'
import { ownerAccess, ownerCreateAccess, setDocumentOwner } from './access'

export const UserSettings: CollectionConfig = {
  slug: 'user-settings',
  admin: { hidden: true },
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
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true, unique: true },
    { name: 'locale', type: 'select', options: ['en', 'vi'], defaultValue: 'en' },
    { name: 'modelDefaults', type: 'json', defaultValue: {} },
    { name: 'imagePreferences', type: 'json', defaultValue: {} },
    { name: 'videoPreferences', type: 'json', defaultValue: {} },
    { name: 'audioPreferences', type: 'json', defaultValue: {} },
    { name: 'uiPreferences', type: 'json', defaultValue: {} },
    {
      name: 'providerCredentials',
      type: 'json',
      access: {
        create: ({ req }) => req.context?.providerSettingsRuntime === true,
        read: ({ req }) => req.context?.providerSettingsRuntime === true,
        update: ({ req }) => req.context?.providerSettingsRuntime === true,
      },
    },
  ],
  timestamps: true,
}

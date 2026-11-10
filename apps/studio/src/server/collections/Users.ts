import type { CollectionConfig, FieldAccess } from 'payload'
import { isAppAdmin, isAppUser } from './access'

const settingsRuntimeAccess: FieldAccess = ({ req }) =>
  req.context?.providerSettingsRuntime === true

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    verify: false,
  },
  admin: {
    hidden: true,
    useAsTitle: 'email',
  },
  access: {
    create: () => false,
    delete: ({ req }) => isAppAdmin(req.user),
    read: ({ req }) => {
      if (isAppAdmin(req.user)) return true
      if (!isAppUser(req.user)) return false
      return { id: { equals: req.user.id } }
    },
    update: ({ req }) => {
      if (isAppAdmin(req.user)) return true
      if (!isAppUser(req.user)) return false
      return { id: { equals: req.user.id } }
    },
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation === 'create') {
          return {
            ...data,
            role: 'user',
            storageQuotaBytes: 5 * 1024 * 1024 * 1024,
            storageUsedBytes: 0,
          }
        }
        if (!isAppAdmin(req.user) && req.context?.adminSetup !== true) {
          const safeData = { ...data }
          delete safeData.role
          delete safeData.storageQuotaBytes
          return safeData
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'locale',
      type: 'select',
      options: ['en', 'vi'],
      defaultValue: 'en',
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'modelDefaults',
      type: 'json',
      defaultValue: {},
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'imagePreferences',
      type: 'json',
      defaultValue: {},
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'videoPreferences',
      type: 'json',
      defaultValue: {},
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'audioPreferences',
      type: 'json',
      defaultValue: {},
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'uiPreferences',
      type: 'json',
      defaultValue: {},
      access: { read: settingsRuntimeAccess },
    },
    {
      name: 'providerCredentials',
      type: 'json',
      access: {
        create: settingsRuntimeAccess,
        read: settingsRuntimeAccess,
        update: settingsRuntimeAccess,
      },
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'user',
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
      access: {
        create: ({ req }) => isAppAdmin(req.user),
        update: ({ req }) => isAppAdmin(req.user),
      },
    },
    {
      name: 'storageQuotaBytes',
      type: 'number',
      defaultValue: 5 * 1024 * 1024 * 1024,
      access: {
        create: ({ req }) => isAppAdmin(req.user),
        update: ({ req }) => isAppAdmin(req.user),
      },
    },
    {
      name: 'storageUsedBytes',
      type: 'number',
      defaultValue: 0,
      access: {
        create: ({ req }) => isAppAdmin(req.user),
        update: ({ req }) => isAppAdmin(req.user),
      },
    },
  ],
  timestamps: true,
}

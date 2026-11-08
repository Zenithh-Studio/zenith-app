import type { CollectionConfig } from 'payload'
import { isAppAdmin, isAppUser } from './access'

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

import type { CollectionConfig } from 'payload'

export const SignupAttempts: CollectionConfig = {
  slug: 'signup-attempts',
  admin: { hidden: true },
  access: {
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  fields: [
    { name: 'ipHash', type: 'text', required: true, unique: true },
    { name: 'count', type: 'number', required: true, defaultValue: 0 },
    { name: 'resetAt', type: 'date', required: true },
  ],
  timestamps: true,
}

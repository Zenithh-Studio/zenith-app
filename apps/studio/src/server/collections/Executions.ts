import type { CollectionConfig } from 'payload'

export const Executions: CollectionConfig = {
  slug: 'executions',
  indexes: [{ fields: ['workflow', 'startedAt'] }],
  admin: {
    group: 'Znith Studio',
    useAsTitle: 'id',
    defaultColumns: ['workflow', 'status', 'startedAt', 'durationMs'],
  },
  access: {
    create: () => true,
    delete: () => false,
    read: () => true,
    update: () => true,
  },
  fields: [
    { name: 'workflow', type: 'relationship', relationTo: 'workflows', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted'],
    },
    { name: 'scope', type: 'text', required: true },
    { name: 'startedAt', type: 'date', required: true },
    { name: 'completedAt', type: 'date' },
    { name: 'durationMs', type: 'number' },
    { name: 'snapshot', type: 'json', required: true },
    { name: 'nodeRecords', type: 'json', required: true, defaultValue: [] },
    { name: 'logs', type: 'json', required: true, defaultValue: [] },
    { name: 'error', type: 'textarea' },
  ],
}

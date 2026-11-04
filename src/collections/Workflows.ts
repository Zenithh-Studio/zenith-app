import type { CollectionConfig } from 'payload'

export const Workflows: CollectionConfig = {
  slug: 'workflows',
  admin: {
    group: 'Znith Studio',
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status', 'updatedAt'],
  },
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
    update: () => true,
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 120 },
    { name: 'description', type: 'textarea', defaultValue: '' },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'custom',
      options: [
        { label: 'Custom', value: 'custom' },
        { label: 'Creative', value: 'creative' },
        { label: 'Story', value: 'story' },
        { label: 'Video', value: 'video' },
        { label: 'Automation', value: 'automation' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'idle',
      options: ['idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled'],
    },
    { name: 'lastExecutionAt', type: 'date' },
    {
      name: 'definition',
      type: 'json',
      required: true,
      defaultValue: { version: 1, nodes: [], edges: [] },
    },
  ],
}

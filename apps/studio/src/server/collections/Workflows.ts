import type { CollectionConfig } from 'payload'
import {
  canWriteWorkflowRuntime,
  isAppAdmin,
  isAppUser,
  isPayloadAdmin,
  ownerAccess,
  setDocumentOwner,
  workflowRuntimeAccess,
} from './access'

export const Workflows: CollectionConfig = {
  slug: 'workflows',
  versions: false,
  indexes: [{ fields: ['owner', 'updatedAt'] }],
  admin: {
    group: 'Znith Studio',
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status', 'updatedAt'],
  },
  access: {
    create: ({ req }) =>
      (isAppUser(req.user) || isAppAdmin(req.user) || isPayloadAdmin(req.user)) &&
      canWriteWorkflowRuntime(req),
    delete: workflowRuntimeAccess,
    read: ownerAccess,
    update: workflowRuntimeAccess,
  },
  hooks: {
    beforeChange: [({ data, req }) => setDocumentOwner({ data, req })],
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
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
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'lastExecutionAt',
      type: 'date',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'definition',
      type: 'json',
      required: true,
      defaultValue: { version: 1, nodes: [], edges: [] },
    },
  ],
}

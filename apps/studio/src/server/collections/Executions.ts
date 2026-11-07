import type { CollectionConfig } from 'payload'
import { canWriteWorkflowRuntime, ownerAccess, workflowRuntimeAccess } from './access'

export const Executions: CollectionConfig = {
  slug: 'executions',
  indexes: [{ fields: ['workflow', 'startedAt'] }],
  admin: {
    group: 'Znith Studio',
    useAsTitle: 'id',
    defaultColumns: ['workflow', 'status', 'startedAt', 'durationMs'],
  },
  access: {
    create: ({ req }) => canWriteWorkflowRuntime(req),
    delete: () => false,
    read: ownerAccess,
    update: workflowRuntimeAccess,
  },
  fields: [
    {
      name: 'workflow',
      type: 'relationship',
      relationTo: 'workflows',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'retryOf',
      type: 'relationship',
      relationTo: 'executions',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted'],
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'scope',
      type: 'text',
      required: true,
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'completedAt',
      type: 'date',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'durationMs',
      type: 'number',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'snapshot',
      type: 'json',
      required: true,
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'nodeRecords',
      type: 'json',
      required: true,
      defaultValue: [],
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'logs',
      type: 'json',
      required: true,
      defaultValue: [],
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
    {
      name: 'error',
      type: 'textarea',
      access: {
        create: ({ req }) => canWriteWorkflowRuntime(req),
        update: ({ req }) => canWriteWorkflowRuntime(req),
      },
    },
  ],
}

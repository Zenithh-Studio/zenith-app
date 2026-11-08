import { z } from 'zod'
import { registryByType } from './registry'

export const workflowDefinitionSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(
      z
        .object({
          id: z.string().min(1),
          type: z.string().min(1),
          name: z.string().min(1),
          slug: z.string().min(1).optional(),
          position: z.object({ x: z.number(), y: z.number() }).strict(),
          config: z.record(z.string(), z.unknown()),
        })
        .strict(),
    ),
    edges: z
      .array(
        z
          .object({
            id: z.string().min(1),
            source: z.string().min(1),
            sourceHandle: z.string().min(1),
            target: z.string().min(1),
            targetHandle: z.string().min(1),
          })
          .strict(),
      )
      .max(10_000),
    groups: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().trim().min(1).max(120),
            description: z.string().max(1000).optional(),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
            collapsed: z.boolean().optional(),
            nodeIds: z.array(z.string().min(1)),
            position: z.object({ x: z.number(), y: z.number() }).strict(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    const nodeIds = new Set<string>()
    const nodesById = new Map<string, (typeof definition.nodes)[number]>()
    definition.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate node identifier “${node.id}”.`,
          path: ['nodes', index, 'id'],
        })
      }
      nodeIds.add(node.id)
      nodesById.set(node.id, node)
    })

    const edgeIds = new Set<string>()
    const connections = new Set<string>()
    const incomingCounts = new Map<string, number>()
    definition.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate edge identifier “${edge.id}”.`,
          path: ['edges', index, 'id'],
        })
      }
      edgeIds.add(edge.id)

      const connectionId = [edge.source, edge.sourceHandle, edge.target, edge.targetHandle].join(
        '\u0000',
      )
      if (connections.has(connectionId)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate connections are not allowed.',
          path: ['edges', index],
        })
      }
      connections.add(connectionId)

      const sourceNode = nodesById.get(edge.source)
      const targetNode = nodesById.get(edge.target)
      if (!sourceNode || !targetNode) {
        context.addIssue({
          code: 'custom',
          message: `Edge “${edge.id}” references a missing node.`,
          path: ['edges', index],
        })
        return
      }

      const sourcePort = registryByType
        .get(sourceNode.type)
        ?.outputs.find((port) => port.id === edge.sourceHandle)
      const targetPort = registryByType
        .get(targetNode.type)
        ?.inputs.find((port) => port.id === edge.targetHandle)
      if (!sourcePort || !targetPort || sourcePort.dataType !== targetPort.dataType) {
        context.addIssue({
          code: 'custom',
          message: `Edge “${edge.id}” connects incompatible ports.`,
          path: ['edges', index],
        })
        return
      }

      const inputKey = `${targetNode.id}\u0000${targetPort.id}`
      const inputCount = (incomingCounts.get(inputKey) ?? 0) + 1
      incomingCounts.set(inputKey, inputCount)
      if (!targetPort.multiple && inputCount > 1) {
        context.addIssue({
          code: 'custom',
          message: `Input “${targetPort.name}” accepts one value.`,
          path: ['edges', index],
        })
      }
    })

    const groupIds = new Set<string>()
    const groupForNode = new Map<string, string>()
    definition.groups?.forEach((group, groupIndex) => {
      if (groupIds.has(group.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate group identifier “${group.id}”.`,
          path: ['groups', groupIndex, 'id'],
        })
      }
      groupIds.add(group.id)
      group.nodeIds.forEach((nodeId, memberIndex) => {
        if (!nodesById.has(nodeId)) {
          context.addIssue({
            code: 'custom',
            message: `Group “${group.name}” references a missing node.`,
            path: ['groups', groupIndex, 'nodeIds', memberIndex],
          })
        }
        const existingGroupId = groupForNode.get(nodeId)
        if (existingGroupId) {
          context.addIssue({
            code: 'custom',
            message: 'A node can belong to only one group.',
            path: ['groups', groupIndex, 'nodeIds', memberIndex],
          })
        }
        groupForNode.set(nodeId, group.id)
      })
    })
  })

export const createWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    templateId: z.enum(['blank', 'story', 'creative', 'video']).default('blank'),
    definition: workflowDefinitionSchema.optional(),
  })
  .strict()

export const updateWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    definition: workflowDefinitionSchema.optional(),
  })
  .strict()

export const executeWorkflowRequestSchema = z
  .object({
    targetNodeId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    retryOfExecutionId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.targetNodeId && request.groupId) {
      context.addIssue({
        code: 'custom',
        message: 'Run a node or a group, not both.',
        path: ['groupId'],
      })
    }
    if (request.retryOfExecutionId && !request.targetNodeId) {
      context.addIssue({
        code: 'custom',
        message: 'A retry must target the failed node.',
        path: ['targetNodeId'],
      })
    }
  })

export type CreateWorkflowRequest = z.infer<typeof createWorkflowRequestSchema>
export type UpdateWorkflowRequest = z.infer<typeof updateWorkflowRequestSchema>
export type ExecuteWorkflowRequest = z.infer<typeof executeWorkflowRequestSchema>

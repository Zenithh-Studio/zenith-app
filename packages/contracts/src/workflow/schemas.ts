import { z } from 'zod'

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
  })
  .strict()

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
  })
  .strict()

export type CreateWorkflowRequest = z.infer<typeof createWorkflowRequestSchema>
export type UpdateWorkflowRequest = z.infer<typeof updateWorkflowRequestSchema>
export type ExecuteWorkflowRequest = z.infer<typeof executeWorkflowRequestSchema>

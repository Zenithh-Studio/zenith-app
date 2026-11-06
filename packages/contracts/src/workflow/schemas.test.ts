import { describe, expect, it } from 'vitest'
import { workflowTemplates } from './templates'
import { workflowDefinitionSchema } from './schemas'
import { validateWorkflowDefinition } from './validation'

describe('workflow contracts', () => {
  it('accepts every starter workflow definition', () => {
    for (const template of Object.values(workflowTemplates)) {
      expect(workflowDefinitionSchema.safeParse(template.definition).success).toBe(true)
    }
  })

  it('rejects unsupported definition versions and unknown node properties', () => {
    expect(workflowDefinitionSchema.safeParse({ version: 2, nodes: [], edges: [] }).success).toBe(
      false,
    )
    expect(
      workflowDefinitionSchema.safeParse({
        version: 1,
        nodes: [
          {
            id: 'node',
            type: 'input.text',
            name: 'Text',
            position: { x: 0, y: 0 },
            config: {},
            owner: 'x',
          },
        ],
        edges: [],
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate identifiers, dangling edges, and incompatible ports', () => {
    const validDefinition = {
      version: 1 as const,
      nodes: [
        {
          id: 'prompt',
          type: 'input.prompt',
          name: 'Prompt',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'preview',
          type: 'output.preview',
          name: 'Preview',
          position: { x: 200, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: 'prompt-preview',
          source: 'prompt',
          sourceHandle: 'prompt',
          target: 'preview',
          targetHandle: 'input',
        },
      ],
    }

    expect(workflowDefinitionSchema.safeParse(validDefinition).success).toBe(true)
    expect(
      workflowDefinitionSchema.safeParse({
        ...validDefinition,
        nodes: [validDefinition.nodes[0], { ...validDefinition.nodes[1], id: 'prompt' }],
      }).success,
    ).toBe(false)
    expect(
      workflowDefinitionSchema.safeParse({
        ...validDefinition,
        edges: [{ ...validDefinition.edges[0], source: 'missing' }],
      }).success,
    ).toBe(false)
    expect(
      workflowDefinitionSchema.safeParse({
        ...validDefinition,
        edges: [{ ...validDefinition.edges[0], targetHandle: 'missing' }],
      }).success,
    ).toBe(false)
  })

  it('checks required inputs and cycles before execution', () => {
    const incompleteDefinition = {
      version: 1 as const,
      nodes: [
        {
          id: 'preview',
          type: 'output.preview',
          name: 'Preview',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    }
    expect(() => validateWorkflowDefinition(incompleteDefinition)).toThrow('missing required input')
  })
})

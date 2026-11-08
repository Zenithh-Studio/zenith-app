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

  it('validates group membership and expands group targets through upstream dependencies', () => {
    const definition = {
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
          id: 'format',
          type: 'processing.template',
          name: 'Format',
          position: { x: 1, y: 0 },
          config: { template: '{{input}}' },
        },
        {
          id: 'preview',
          type: 'output.preview',
          name: 'Preview',
          position: { x: 2, y: 0 },
          config: {},
        },
        { id: 'unused', type: 'input.text', name: 'Unused', position: { x: 3, y: 0 }, config: {} },
      ],
      edges: [
        {
          id: 'prompt-format',
          source: 'prompt',
          sourceHandle: 'prompt',
          target: 'format',
          targetHandle: 'input',
        },
        {
          id: 'format-preview',
          source: 'format',
          sourceHandle: 'text',
          target: 'preview',
          targetHandle: 'input',
        },
      ],
      groups: [
        {
          id: 'group-1',
          name: 'Outputs',
          nodeIds: ['preview'],
          position: { x: 0, y: 0 },
          width: 500,
          height: 300,
        },
      ],
    }

    expect(workflowDefinitionSchema.safeParse(definition).success).toBe(true)
    expect(
      validateWorkflowDefinition(definition, undefined, ['preview']).map((node) => node.id),
    ).toEqual(['prompt', 'format', 'preview'])
    expect(
      workflowDefinitionSchema.safeParse({
        ...definition,
        groups: [
          definition.groups[0],
          { ...definition.groups[0], id: 'group-2', nodeIds: ['preview'] },
        ],
      }).success,
    ).toBe(false)
  })
})

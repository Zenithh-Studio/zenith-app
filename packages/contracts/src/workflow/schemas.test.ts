import { describe, expect, it } from 'vitest'
import { workflowTemplates } from './templates'
import { workflowDefinitionSchema } from './schemas'

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
})

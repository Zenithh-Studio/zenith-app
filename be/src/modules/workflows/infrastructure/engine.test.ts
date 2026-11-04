import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { runWorkflow } from './engine'
import { canConnect, nodeRegistry, providersFor, registryByType } from '@znith/contracts'
import type { WorkflowDefinition } from '@znith/contracts'

const executableDefinition: WorkflowDefinition = {
  version: 1,
  nodes: [
    {
      id: 'input',
      type: 'input.prompt',
      name: 'Brief',
      position: { x: 0, y: 0 },
      config: { value: 'A quiet product film.' },
    },
    {
      id: 'template',
      type: 'processing.template',
      name: 'Format',
      position: { x: 300, y: 0 },
      config: { template: 'Direction: {{input}}' },
    },
    {
      id: 'preview',
      type: 'output.preview',
      name: 'Preview',
      position: { x: 600, y: 0 },
      config: {},
    },
  ],
  edges: [
    {
      id: 'input-template',
      source: 'input',
      sourceHandle: 'prompt',
      target: 'template',
      targetHandle: 'input',
    },
    {
      id: 'template-preview',
      source: 'template',
      sourceHandle: 'text',
      target: 'preview',
      targetHandle: 'input',
    },
  ],
}

describe('node registry', () => {
  it('registers independent definitions and typed ports', () => {
    expect(registryByType.get('ai.generate-text')?.version).toBe(1)
    expect(canConnect('input.prompt', 'prompt', 'ai.generate-text', 'prompt')).toBe(true)
    expect(canConnect('input.json', 'json', 'ai.generate-text', 'prompt')).toBe(false)
    expect(canConnect('input.image', 'image', 'ai.generate-image', 'image')).toBe(true)
    expect(canConnect('input.video', 'video', 'ai.generate-video', 'video')).toBe(true)
  })

  it('declares provider capabilities by modality', () => {
    expect(providersFor('text').map((provider) => provider.id)).toEqual(
      expect.arrayContaining(['openai', 'anthropic', 'gemini', 'custom-http']),
    )
    expect(providersFor('video').map((provider) => provider.id)).toEqual(
      expect.arrayContaining(['replicate', 'comfyui', 'custom-http']),
    )
  })
})

describe('workflow engine', () => {
  beforeEach(() => vi.stubEnv('APP_OPENAI_API_KEY', ''))

  it('maps actual upstream values through explicit handles', async () => {
    const result = await runWorkflow(executableDefinition)
    expect(result.status).toBe('succeeded')
    expect(result.records).toHaveLength(3)
    expect(result.records[2].outputs?.output.value).toBe('Direction: A quiet product film.')
  })

  it('executes only the selected node and its dependency chain', async () => {
    const result = await runWorkflow(executableDefinition, 'template')
    expect(result.status).toBe('succeeded')
    expect(result.records.map((record) => record.nodeId)).toEqual(['input', 'template'])
  })

  it('rejects cycles before executing nodes', async () => {
    const cyclic: WorkflowDefinition = {
      ...structuredClone(executableDefinition),
      edges: [
        ...executableDefinition.edges,
        {
          id: 'cycle',
          source: 'preview',
          sourceHandle: 'output',
          target: 'template',
          targetHandle: 'input',
        },
      ],
    }
    const result = await runWorkflow(cyclic)
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/accepts one value|cycles/i)
  })

  it('reports provider configuration instead of returning mock AI output', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        executableDefinition.nodes[0],
        {
          id: 'ai',
          type: 'ai.generate-text',
          name: 'Generate',
          position: { x: 300, y: 0 },
          config: { model: 'gpt-4o-mini' },
        },
      ],
      edges: [
        {
          id: 'input-ai',
          source: 'input',
          sourceHandle: 'prompt',
          target: 'ai',
          targetHandle: 'prompt',
        },
      ],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('APP_OPENAI_API_KEY')
    expect(result.records.at(-1)?.outputs).toBeUndefined()
  })

  it('runs independent ready nodes concurrently', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'input',
          type: 'input.text',
          name: 'Input',
          position: { x: 0, y: 0 },
          config: { value: 'value' },
        },
        ...['a', 'b'].map((id) => ({
          id,
          type: 'utility.delay',
          name: `Delay ${id}`,
          position: { x: 200, y: id === 'a' ? 0 : 200 },
          config: { milliseconds: 120 },
        })),
        {
          id: 'merge',
          type: 'processing.merge-text',
          name: 'Merge',
          position: { x: 500, y: 0 },
          config: { separator: '+' },
        },
      ],
      edges: [
        {
          id: 'input-a',
          source: 'input',
          sourceHandle: 'text',
          target: 'a',
          targetHandle: 'input',
        },
        {
          id: 'input-b',
          source: 'input',
          sourceHandle: 'text',
          target: 'b',
          targetHandle: 'input',
        },
        {
          id: 'a-merge',
          source: 'a',
          sourceHandle: 'output',
          target: 'merge',
          targetHandle: 'texts',
        },
        {
          id: 'b-merge',
          source: 'b',
          sourceHandle: 'output',
          target: 'merge',
          targetHandle: 'texts',
        },
      ],
    }
    const started = Date.now()
    const result = await runWorkflow(definition, undefined, { concurrency: 2 })
    expect(result.status).toBe('succeeded')
    expect(Date.now() - started).toBeLessThan(220)
    expect(result.records.find((record) => record.nodeId === 'merge')?.outputs?.text.value).toBe(
      'value+value',
    )
  })

  it('marks dependent nodes skipped while independent branches complete', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        executableDefinition.nodes[0],
        {
          id: 'ai',
          type: 'ai.generate-text',
          name: 'Generate',
          position: { x: 200, y: 0 },
          config: {},
        },
        {
          id: 'preview',
          type: 'output.preview',
          name: 'Preview',
          position: { x: 400, y: 0 },
          config: {},
        },
        {
          id: 'independent',
          type: 'utility.variable',
          name: 'Independent',
          position: { x: 0, y: 200 },
          config: { value: 'still runs' },
        },
      ],
      edges: [
        {
          id: 'input-ai',
          source: 'input',
          sourceHandle: 'prompt',
          target: 'ai',
          targetHandle: 'prompt',
        },
        {
          id: 'ai-preview',
          source: 'ai',
          sourceHandle: 'text',
          target: 'preview',
          targetHandle: 'input',
        },
      ],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.records.find((record) => record.nodeId === 'preview')?.status).toBe('skipped')
    expect(result.records.find((record) => record.nodeId === 'independent')?.status).toBe(
      'succeeded',
    )
  })

  it('enforces node timeouts', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'input',
          type: 'input.text',
          name: 'Input',
          position: { x: 0, y: 0 },
          config: { value: 'value' },
        },
        {
          id: 'delay',
          type: 'utility.delay',
          name: 'Slow delay',
          position: { x: 200, y: 0 },
          config: { milliseconds: 250, timeoutMs: 100 },
        },
      ],
      edges: [
        {
          id: 'input-delay',
          source: 'input',
          sourceHandle: 'text',
          target: 'delay',
          targetHandle: 'input',
        },
      ],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('timed out')
  })

  it('blocks HTTP requests to private networks', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'request',
          type: 'utility.http-request',
          name: 'Unsafe request',
          position: { x: 0, y: 0 },
          config: { url: 'https://127.0.0.1/private', method: 'GET' },
        },
      ],
      edges: [],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('private networks')
  })

  it('passes persisted image asset references through processing and output nodes', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'image',
          type: 'input.image',
          name: 'Image',
          position: { x: 0, y: 0 },
          config: {
            assetId: 'asset-1',
            url: '/api/media/file/example.png',
            mimeType: 'image/png',
          },
        },
        {
          id: 'layout',
          type: 'processing.compose-layout',
          name: 'Layout',
          position: { x: 200, y: 0 },
          config: { aspectRatio: '16:9', fit: 'cover', background: '#ffffff' },
        },
        {
          id: 'save',
          type: 'output.save-image',
          name: 'Save',
          position: { x: 400, y: 0 },
          config: { fileName: 'creative.png' },
        },
      ],
      edges: [
        {
          id: 'image-layout',
          source: 'image',
          sourceHandle: 'image',
          target: 'layout',
          targetHandle: 'image',
        },
        {
          id: 'layout-save',
          source: 'layout',
          sourceHandle: 'image',
          target: 'save',
          targetHandle: 'image',
        },
      ],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('succeeded')
    const output = result.records.find((record) => record.nodeId === 'save')?.outputs?.image
    expect(output?.assetId).toBe('asset-1')
    expect(output?.metadata?.fileName).toBe('creative.png')
    expect(output?.metadata?.layout).toMatchObject({ aspectRatio: '16:9' })
  })

  it('keeps image generation real by requiring provider configuration', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate image',
          position: { x: 0, y: 0 },
          config: { provider: 'openai', model: 'dall-e-3', prompt: 'A studio product image' },
        },
      ],
      edges: [],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('APP_OPENAI_API_KEY')
  })

  it.each([
    ['anthropic', 'claude-3-5-haiku-latest', 'APP_ANTHROPIC_API_KEY'],
    ['gemini', 'gemini-2.0-flash', 'APP_GEMINI_API_KEY'],
  ])('reports missing %s credentials without mock output', async (provider, model, secret) => {
    vi.stubEnv(secret, '')
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'prompt',
          type: 'input.prompt',
          name: 'Prompt',
          position: { x: 0, y: 0 },
          config: { value: 'Write a line.' },
        },
        {
          id: 'generate',
          type: 'ai.generate-text',
          name: 'Generate',
          position: { x: 200, y: 0 },
          config: { provider, model, retryCount: 0 },
        },
      ],
      edges: [
        {
          id: 'prompt-generate',
          source: 'prompt',
          sourceHandle: 'prompt',
          target: 'generate',
          targetHandle: 'prompt',
        },
      ],
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain(secret)
  })

  it('accepts prompt plus multiple image references on one generation node', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        ...['one', 'two'].map((id) => ({
          id,
          type: 'input.image',
          name: `Image ${id}`,
          position: { x: 0, y: id === 'one' ? 0 : 200 },
          config: { url: `/api/media/file/${id}.png`, assetId: id },
        })),
        {
          id: 'prompt',
          type: 'input.prompt',
          name: 'Prompt',
          position: { x: 0, y: 400 },
          config: { value: 'Animate both visual references.' },
        },
        {
          id: 'generate',
          type: 'ai.generate-video',
          name: 'Generate video',
          position: { x: 400, y: 100 },
          config: { provider: 'replicate', model: 'model-version', retryCount: 0 },
        },
      ],
      edges: [
        ...['one', 'two'].map((id) => ({
          id: `${id}-generate`,
          source: id,
          sourceHandle: 'image',
          target: 'generate',
          targetHandle: 'image',
        })),
        {
          id: 'prompt-generate',
          source: 'prompt',
          sourceHandle: 'prompt',
          target: 'generate',
          targetHandle: 'prompt',
        },
      ],
    }
    vi.stubEnv('REPLICATE_API_TOKEN', '')
    const result = await runWorkflow(definition)
    expect(result.records.filter((record) => record.status === 'succeeded')).toHaveLength(3)
    expect(result.error).toContain('REPLICATE_API_TOKEN')
  })

  it('asks for a Prompt node when generation has no prompt source', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate image',
          position: { x: 0, y: 0 },
          config: { provider: 'openai', model: 'dall-e-3', prompt: '', retryCount: 0 },
        },
      ],
      edges: [],
    }
    const result = await runWorkflow(definition)
    expect(result.error).toContain('Add a Prompt Input connection')
  })

  it('supports one text output fan-out to multiple downstream nodes', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'prompt',
          type: 'input.prompt',
          name: 'Shared prompt',
          position: { x: 0, y: 0 },
          config: { value: 'Shared creative direction' },
        },
        ...['one', 'two'].map((id) => ({
          id,
          type: 'processing.template',
          name: `Template ${id}`,
          position: { x: 300, y: id === 'one' ? 0 : 200 },
          config: { template: '{{input}}' },
        })),
      ],
      edges: ['one', 'two'].map((id) => ({
        id: `prompt-${id}`,
        source: 'prompt',
        sourceHandle: 'prompt',
        target: id,
        targetHandle: 'input',
      })),
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('succeeded')
    expect(result.records.filter((record) => record.status === 'succeeded')).toHaveLength(3)
  })

  it('rejects more than one text prompt on a single generation input', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        ...['one', 'two'].map((id) => ({
          id,
          type: 'input.prompt',
          name: `Prompt ${id}`,
          position: { x: 0, y: id === 'one' ? 0 : 200 },
          config: { value: id },
        })),
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate',
          position: { x: 300, y: 0 },
          config: { provider: 'openai', model: 'dall-e-3' },
        },
      ],
      edges: ['one', 'two'].map((id) => ({
        id: `${id}-generate`,
        source: id,
        sourceHandle: 'prompt',
        target: 'generate',
        targetHandle: 'prompt',
      })),
    }
    const result = await runWorkflow(definition)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('accepts one value')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { runWorkflow } from './engine'
import { canConnect, providersFor, registryByType } from '@znith/contracts'
import type { ExecutionLog, NodeExecutionRecord, WorkflowDefinition } from '@znith/contracts'

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

function muse2APIDefinition({
  images = [],
  videos = [],
  config = {},
}: {
  images?: string[]
  videos?: string[]
  config?: Record<string, unknown>
} = {}): WorkflowDefinition {
  return {
    version: 1,
    nodes: [
      ...images.map((url, index) => ({
        id: `image-${index}`,
        type: 'input.image',
        name: `Frame ${index + 1}`,
        position: { x: 0, y: index * 100 },
        config: { url, assetId: `asset-${index + 1}`, mimeType: 'image/png' },
      })),
      ...videos.map((url, index) => ({
        id: `video-${index}`,
        type: 'input.video',
        name: `Reference ${index + 1}`,
        position: { x: 0, y: index * 100 },
        config: { url, assetId: `video-${index + 1}`, mimeType: 'video/mp4' },
      })),
      {
        id: 'generate',
        type: 'ai.generate-video',
        name: 'Generate video',
        position: { x: 300, y: 0 },
        config: {
          provider: 'muse2api',
          model: 'muse-video',
          prompt: 'A quiet shoreline at sunrise.',
          aspectRatio: '16:9',
          duration: 5,
          timeoutMs: 30_000,
          retryCount: 0,
          ...config,
        },
      },
    ],
    edges: [
      ...images.map((_, index) => ({
        id: `image-${index}-generate`,
        source: `image-${index}`,
        sourceHandle: 'image',
        target: 'generate',
        targetHandle: 'image',
      })),
      ...videos.map((_, index) => ({
        id: `video-${index}-generate`,
        source: `video-${index}`,
        sourceHandle: 'video',
        target: 'generate',
        targetHandle: 'video',
      })),
    ],
  } as WorkflowDefinition
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockImmediatePolling() {
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void,
    delay?: number,
  ) => {
    if (delay === 1_500) queueMicrotask(callback)
    return 0 as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout)
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

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
      expect.arrayContaining(['muse2api', 'replicate', 'comfyui', 'custom-http']),
    )
  })
})

describe('workflow engine', () => {
  beforeEach(() => {
    vi.stubEnv('APP_OPENAI_API_KEY', '')
    vi.stubEnv('APP_MUSE2API_BASE_URL', 'http://muse2api:18610/v1')
    vi.stubEnv('APP_MUSE2API_API_KEY', 'muse-test-key')
  })

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

  it('uses a saved media version as the node output and passes it downstream', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate image',
          position: { x: 0, y: 0 },
          config: {
            provider: 'chatgpt2api',
            selectedOutput: {
              type: 'image',
              value: {
                url: '/api/media/file/selected-version.png',
                fileName: 'selected-version.png',
              },
              assetId: 'selected-asset',
            },
          },
        },
        {
          id: 'save',
          type: 'output.save-image',
          name: 'Save selected image',
          position: { x: 300, y: 0 },
          config: { fileName: 'selected.png' },
        },
      ],
      edges: [
        {
          id: 'generate-save',
          source: 'generate',
          sourceHandle: 'image',
          target: 'save',
          targetHandle: 'image',
        },
      ],
    }

    const result = await runWorkflow(definition)

    expect(result.status).toBe('succeeded')
    expect(
      result.records.find((record) => record.nodeId === 'generate')?.outputs?.image,
    ).toMatchObject({
      type: 'image',
      value: { url: '/api/media/file/selected-version.png' },
      assetId: 'selected-asset',
    })
    expect(
      result.records.find((record) => record.nodeId === 'save')?.outputs?.image.value,
    ).toMatchObject({
      url: '/api/media/file/selected-version.png',
      fileName: 'selected-version.png',
    })
    expect(result.logs.some((log) => log.message.includes('selected saved media output'))).toBe(
      true,
    )
  })

  it('passes the selected image aspect ratio to ChatGPT2API', async () => {
    vi.stubEnv('APP_CHATGPT2API_BASE_URL', 'http://chatgpt2api:3000/v1')
    vi.stubEnv('APP_CHATGPT2API_API_KEY', 'test-api-key')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'http://media.test/generated.png' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'generate',
          type: 'ai.generate-image',
          name: 'Generate image',
          position: { x: 0, y: 0 },
          config: {
            provider: 'chatgpt2api',
            model: 'gpt-image-2',
            prompt: 'A product photo',
            aspectRatio: '3:2',
            retryCount: 0,
          },
        },
      ],
      edges: [],
    }

    const result = await runWorkflow(definition)

    expect(result.status).toBe('succeeded')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      size: '1536x1024',
    })
  })

  it('persists queued and running node records before execution finishes', async () => {
    const definition: WorkflowDefinition = {
      version: 1,
      nodes: [
        {
          id: 'input',
          type: 'input.text',
          name: 'Input',
          position: { x: 0, y: 0 },
          config: { value: 'wait' },
        },
        {
          id: 'delay',
          type: 'utility.delay',
          name: 'Wait',
          position: { x: 200, y: 0 },
          config: { milliseconds: 150 },
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
    const progress: NodeExecutionRecord[] = []
    const logs: ExecutionLog[] = []
    const run = runWorkflow(definition, undefined, {
      onNodeRecord: async (record) => {
        progress.push(structuredClone(record))
      },
      onExecutionLog: async (log) => {
        logs.push(log)
      },
    })

    await vi.waitFor(() =>
      expect(progress.filter((record) => record.nodeId === 'delay').at(-1)?.status).toBe('running'),
    )
    expect(progress.filter((record) => record.nodeId === 'delay').at(-1)?.status).toBe('running')

    const result = await run
    expect(result.records.find((record) => record.nodeId === 'delay')?.status).toBe('succeeded')
    expect(
      progress.filter((record) => record.nodeId === 'delay').map((record) => record.status),
    ).toEqual(['queued', 'running', 'succeeded'])
    expect(logs.filter((log) => log.nodeId === 'delay').map((log) => log.message)).toEqual([
      'Wait queued',
      'Wait started',
      'Wait completed',
    ])
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

  it('uses Gemini 3.8 Flash without unsupported sampling settings', async () => {
    vi.stubEnv('APP_GEMINI_API_KEY', 'gemini-test-key')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'A concise answer.' }] } }] }),
      )
    vi.stubGlobal('fetch', fetchMock)

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
          config: {
            provider: 'gemini',
            model: 'gemini-3.8-flash',
            temperature: 0.2,
            retryCount: 0,
          },
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

    expect(result.status).toBe('succeeded')
    expect(result.records.at(-1)?.outputs?.text.value).toBe('A concise answer.')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/models/gemini-3.8-flash:generateContent')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      'generationConfig',
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
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

describe('Muse2API video provider', () => {
  beforeEach(() => {
    vi.stubEnv('APP_MUSE2API_BASE_URL', 'http://muse2api:18610/v1')
    vi.stubEnv('APP_MUSE2API_API_KEY', 'muse-test-key')
  })

  it('submits a video task, polls until success, and resolves relative media URLs', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'task-123', status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-123',
          status: 'succeeded',
          model: 'muse-video',
          result: { url: '/v1/media/generated.mp4' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    mockImmediatePolling()

    const result = await runWorkflow(
      muse2APIDefinition({ config: { aspectRatio: '9:16', duration: 90 } }),
    )

    expect(result.status).toBe('succeeded')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [createURL, createOptions] = fetchMock.mock.calls[0]
    expect(createURL).toBe('http://muse2api:18610/v1/videos')
    expect(createOptions?.method).toBe('POST')
    expect(createOptions?.headers).toMatchObject({ Authorization: 'Bearer muse-test-key' })
    expect(JSON.parse(String(createOptions?.body))).toEqual({
      model: 'muse-video',
      prompt: 'A quiet shoreline at sunrise.',
      size: '9:16',
      duration: 60,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('http://muse2api:18610/v1/videos/task-123')
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer muse-test-key',
    })
    expect(result.records[0].outputs?.video).toMatchObject({
      type: 'video',
      value: { url: 'http://muse2api:18610/v1/media/generated.mp4' },
      metadata: { provider: 'muse2api', model: 'muse-video', providerJobId: 'task-123' },
    })
  })

  it('sends a first-frame image as a bounded data URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1, 2, 3]), {
          headers: { 'Content-Type': 'image/png' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-image',
          status: 'succeeded',
          result: { url: 'http://muse2api:18610/v1/media/animated.mp4' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await runWorkflow(muse2APIDefinition({ images: ['/api/media/file/frame.png'] }))

    expect(result.status).toBe('succeeded')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/api/media/file/frame.png')
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { image?: string }
    expect(body.image).toBe('data:image/png;base64,AQID')
    expect(result.records.at(-1)?.outputs?.video?.metadata).toMatchObject({
      referenceAssetId: 'asset-1',
    })
  })

  it('fails before making a request when the server API key is missing', async () => {
    vi.stubEnv('APP_MUSE2API_API_KEY', '')
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await runWorkflow(muse2APIDefinition())

    expect(result.status).toBe('failed')
    expect(result.error).toContain('APP_MUSE2API_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid gateway URLs before making a request', async () => {
    vi.stubEnv('APP_MUSE2API_BASE_URL', 'http://muse2api:18610/v2')
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const result = await runWorkflow(muse2APIDefinition())

    expect(result.status).toBe('failed')
    expect(result.error).toContain('APP_MUSE2API_BASE_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces gateway authentication and task errors', async () => {
    const unauthorizedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid API key.' } }, 401))
    vi.stubGlobal('fetch', unauthorizedFetch)
    const unauthorized = await runWorkflow(muse2APIDefinition())
    expect(unauthorized.status).toBe('failed')
    expect(unauthorized.error).toContain('Invalid API key.')
    expect(unauthorizedFetch).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
    const failedTaskFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'task-failed', status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'task-failed', status: 'failed', error: 'No available account.' }),
      )
    vi.stubGlobal('fetch', failedTaskFetch)
    mockImmediatePolling()

    const failedTask = await runWorkflow(muse2APIDefinition())
    expect(failedTask.status).toBe('failed')
    expect(failedTask.error).toContain('No available account.')
    expect(failedTaskFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed tasks and completed tasks without a media URL', async () => {
    const missingIDFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 'queued' }))
    vi.stubGlobal('fetch', missingIDFetch)
    const missingID = await runWorkflow(muse2APIDefinition())
    expect(missingID.status).toBe('failed')
    expect(missingID.error).toContain('task ID')

    vi.unstubAllGlobals()
    const missingURLFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'task-empty', status: 'succeeded' }))
    vi.stubGlobal('fetch', missingURLFetch)
    const missingURL = await runWorkflow(muse2APIDefinition())
    expect(missingURL.status).toBe('failed')
    expect(missingURL.error).toContain('without a video URL')
  })

  it('rejects unsupported extra references and invalid or oversized image files', async () => {
    const noNetwork = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', noNetwork)
    const multipleImages = await runWorkflow(
      muse2APIDefinition({ images: ['/frame-1.png', '/frame-2.png'] }),
    )
    expect(multipleImages.error).toContain('one first-frame image')
    const referenceVideo = await runWorkflow(muse2APIDefinition({ videos: ['/reference.mp4'] }))
    expect(referenceVideo.error).toContain('first-frame image-to-video only')
    expect(noNetwork).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    const wrongTypeFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{"not":"an image"}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', wrongTypeFetch)
    const wrongType = await runWorkflow(
      muse2APIDefinition({ images: ['/api/media/file/frame.json'] }),
    )
    expect(wrongType.status).toBe('failed')
    expect(wrongType.error).toContain('must be image files')
    expect(wrongTypeFetch).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
    const oversizedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('too large', {
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(10 * 1024 * 1024 + 1) },
      }),
    )
    vi.stubGlobal('fetch', oversizedFetch)
    const oversized = await runWorkflow(
      muse2APIDefinition({ images: ['/api/media/file/huge.png'] }),
    )
    expect(oversized.status).toBe('failed')
    expect(oversized.error).toContain('10 MB or smaller')
    expect(oversizedFetch).toHaveBeenCalledTimes(1)
  })
})

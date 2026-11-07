import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NodeValue, WorkflowNode } from '@znith/contracts'
import type { AssetService } from '../../assets/application/asset-service'
import { WorkflowMediaPersister } from './workflow-media-persister'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('WorkflowMediaPersister', () => {
  it('downloads a Muse2API video and stores it as a Payload asset', async () => {
    vi.stubEnv('APP_MUSE2API_BASE_URL', 'http://muse2api:18610/v1')
    const uploadAsset = vi.fn(async () => ({
      id: 'saved-video-id',
      url: '/api/media/file/generated-video.mp4',
      filename: 'generated-video.mp4',
      mimeType: 'video/mp4',
    }))
    const assetService = { uploadAsset } as unknown as AssetService
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(Uint8Array.from([1, 2, 3]), {
        headers: { 'Content-Type': 'video/mp4' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const node = {
      id: 'generate-video',
      type: 'ai.generate-video',
      name: 'Generate video',
      position: { x: 0, y: 0 },
      config: { provider: 'muse2api' },
    } as WorkflowNode
    const outputs: Record<string, NodeValue> = {
      video: {
        type: 'video',
        value: { url: 'http://muse2api:18610/v1/media/generated.mp4' },
        metadata: { provider: 'muse2api', providerJobId: 'task-123' },
      },
    }

    const mediaPersister = new WorkflowMediaPersister(assetService)
    const result = await mediaPersister.persist('workflow-1', 'execution-1', node, outputs)
    const repeatedSave = await mediaPersister.persist(
      'workflow-1',
      'execution-1',
      node,
      result.outputs,
    )

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://muse2api:18610/v1/media/generated.mp4',
    )
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('error')
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeDefined()
    expect(uploadAsset).toHaveBeenCalledWith({
      alt: 'Generate video output from workflow workflow-1',
      source: 'workflow',
      sourceWorkflow: 'workflow-1',
      sourceExecution: 'execution-1',
      file: {
        buffer: Buffer.from([1, 2, 3]),
        mimetype: 'video/mp4',
        name: 'generate-video-execution-1-video.mp4',
        size: 3,
      },
    })
    expect(result.warnings).toEqual([])
    expect(repeatedSave.outputs).toEqual(result.outputs)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(uploadAsset).toHaveBeenCalledOnce()
    expect(result.outputs.video).toMatchObject({
      assetId: 'saved-video-id',
      value: {
        url: '/api/media/file/generated-video.mp4',
        assetId: 'saved-video-id',
        filename: 'generated-video.mp4',
        mimeType: 'video/mp4',
      },
      metadata: {
        provider: 'muse2api',
        providerJobId: 'task-123',
        savedToAssets: true,
      },
    })
  })

  it('keeps the provider output and returns a warning when the video cannot be downloaded', async () => {
    vi.stubEnv('APP_MUSE2API_BASE_URL', 'http://muse2api:18610/v1')
    const uploadAsset = vi.fn()
    const assetService = { uploadAsset } as unknown as AssetService
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('unavailable', { status: 503 })),
    )
    const node = {
      id: 'generate-video',
      type: 'ai.generate-video',
      name: 'Generate video',
      position: { x: 0, y: 0 },
      config: { provider: 'muse2api' },
    } as WorkflowNode
    const outputs: Record<string, NodeValue> = {
      video: {
        type: 'video',
        value: { url: 'http://muse2api:18610/v1/media/generated.mp4' },
        metadata: { provider: 'muse2api' },
      },
    }

    const result = await new WorkflowMediaPersister(assetService).persist(
      'workflow-1',
      'execution-1',
      node,
      outputs,
    )

    expect(uploadAsset).not.toHaveBeenCalled()
    expect(result.warnings).toHaveLength(1)
    expect(result.outputs.video).toMatchObject({
      value: { url: 'http://muse2api:18610/v1/media/generated.mp4' },
      metadata: {
        provider: 'muse2api',
        saveWarning: expect.stringContaining('Could not save video'),
      },
    })
  })
})

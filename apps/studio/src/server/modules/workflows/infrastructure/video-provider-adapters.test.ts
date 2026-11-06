vi.mock('server-only', () => ({}))

import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateVideoWithProvider } from './video-provider-adapters'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const baseInput = {
  prompt: 'A calm coastal landscape at sunset.',
  aspectRatio: '16:9',
  duration: 6,
  resolution: '1080p',
  generateAudio: true,
  timeoutMs: 30_000,
}

describe('video provider adapters', () => {
  it('runs Seedance 2.5 through Replicate with resolution and audio options', async () => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'replicate-test-token')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: 'prediction-1',
        status: 'succeeded',
        output: 'https://replicate.delivery/video.mp4',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateVideoWithProvider({
      ...baseInput,
      provider: 'replicate',
      model: 'bytedance/seedance-2.5',
    })

    expect(result).toMatchObject({
      url: 'https://replicate.delivery/video.mp4',
      providerJobId: 'prediction-1',
      model: 'bytedance/seedance-2.5',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/bytedance/seedance-2.5/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer replicate-test-token' }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      input: {
        prompt: baseInput.prompt,
        duration: 6,
        resolution: '1080p',
        aspect_ratio: '16:9',
        generate_audio: true,
      },
    })
  })

  it('uses Gemini Interactions for Omni Flash and returns generated video data', async () => {
    vi.stubEnv('APP_GEMINI_API_KEY', 'gemini-test-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: 'interaction-1',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'AQID' }],
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateVideoWithProvider({
      ...baseInput,
      provider: 'gemini',
      model: 'gemini-omni-1.1-flash',
    })

    expect(result).toMatchObject({
      url: 'data:video/mp4;base64,AQID',
      providerJobId: 'interaction-1',
      model: 'gemini-omni-1.1-flash',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-key' }),
      }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'gemini-omni-1.1-flash',
      response_format: {
        type: 'video',
        aspect_ratio: '16:9',
        resolution: '1080p',
        duration: '6s',
      },
    })
  })

  it('waits for Gemini URI video processing before downloading the file', async () => {
    vi.stubEnv('APP_GEMINI_API_KEY', 'gemini-test-key')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 'interaction-2',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [
                {
                  type: 'video',
                  uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media',
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ state: 'ACTIVE' }))
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateVideoWithProvider({
      ...baseInput,
      provider: 'gemini',
      model: 'gemini-omni-1.1-flash',
    })

    expect(result.url).toBe('data:video/mp4;base64,AQID')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://generativelanguage.googleapis.com/v1beta/files/video-123',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media',
    )
  })

  it('polls Veo 3.1 Fast and downloads the result using the Gemini API key', async () => {
    vi.stubEnv('APP_GEMINI_API_KEY', 'gemini-test-key')
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          name: 'operations/veo-1',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [
                { video: { uri: 'https://generativelanguage.googleapis.com/video' } },
              ],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateVideoWithProvider({
      ...baseInput,
      provider: 'gemini',
      model: 'veo-3.1-fast-generate-preview',
    })

    expect(result).toMatchObject({
      url: 'data:video/mp4;base64,AQID',
      providerJobId: 'operations/veo-1',
      model: 'veo-3.1-fast-generate-preview',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      instances: [{ prompt: baseInput.prompt }],
      parameters: {
        aspectRatio: '16:9',
        resolution: '1080p',
        durationSeconds: 6,
        sampleCount: 1,
      },
    })
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
    })
  })

  it('creates a Runway Gen-4.5 task for text-to-video', async () => {
    vi.stubEnv('RUNWAYML_API_SECRET', 'runway-test-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: 'runway-task-1',
        status: 'SUCCEEDED',
        output: ['https://runway.example/video.mp4'],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateVideoWithProvider({
      ...baseInput,
      provider: 'runway',
      model: 'gen4.5',
    })

    expect(result).toMatchObject({
      url: 'https://runway.example/video.mp4',
      providerJobId: 'runway-task-1',
      model: 'gen4.5',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/text_to_video',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer runway-test-key',
          'X-Runway-Version': '2024-11-06',
        }),
      }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'gen4.5',
      promptText: baseInput.prompt,
      ratio: '1280:720',
      duration: 5,
    })
  })

  it('requires the selected provider credential and rejects unsupported model combinations', async () => {
    vi.stubEnv('REPLICATE_API_TOKEN', '')
    await expect(
      generateVideoWithProvider({
        ...baseInput,
        provider: 'replicate',
        model: 'bytedance/seedance-2.5',
      }),
    ).rejects.toThrow('REPLICATE_API_TOKEN')
    await expect(
      generateVideoWithProvider({ ...baseInput, provider: 'gemini', model: 'unknown-model' }),
    ).rejects.toThrow('Unsupported video model')
  })
})

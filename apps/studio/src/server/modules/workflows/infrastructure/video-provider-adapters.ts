import 'server-only'

import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { clampNumber } from '@znith/utils'

export interface VideoGenerationInput {
  provider: string
  model: string
  prompt: string
  aspectRatio: string
  duration: number
  resolution: string
  generateAudio: boolean
  image?: unknown
  video?: unknown
  timeoutMs: number
}

export interface VideoGenerationResult {
  url: string
  providerJobId?: string
  model: string
}

const text = (value: unknown) => String(value ?? '')

function mediaUrl(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    return text((value as Record<string, unknown>).url)
  }
  return ''
}

function requireKey(name: 'APP_GEMINI_API_KEY' | 'REPLICATE_API_TOKEN' | 'RUNWAYML_API_SECRET') {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name.replace('APP_', '').replace('_API_KEY', '')} is not configured. Set the ${name} server environment variable.`,
    )
  }
  return value
}

function deadlineFor(timeoutMs: number) {
  return Date.now() + clampNumber(timeoutMs || 300_000, 1_000, 900_000)
}

function requestTimeout(deadline: number) {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('Video generation timed out.')
  return AbortSignal.timeout(Math.min(remaining, 30_000))
}

async function readJSON<T>(response: Response, provider: string): Promise<T> {
  const result = (await response.json()) as T & {
    error?: string | { message?: string }
    message?: string
  }
  if (!response.ok) {
    const error =
      typeof result.error === 'string' ? result.error : result.error?.message || result.message
    throw new Error(error || `${provider} video generation failed (${response.status}).`)
  }
  return result
}

async function readResponseBytes(response: Response, maximumBytes: number) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The reference media response was empty.')
  const chunks: Buffer[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maximumBytes) {
      await reader.cancel()
      throw new Error(`Reference files must be ${maximumBytes / 1024 / 1024} MB or smaller.`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, totalBytes)
}

function isPrivateAddress(address: string) {
  if (address === '::1' || address === '::' || address.startsWith('::ffff:127.')) return true
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:'))
    return true
  const parts = address.split('.').map(Number)
  if (parts.length !== 4) return false
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  )
}

async function mediaData(value: unknown, maximumBytes: number, expectedType: 'image' | 'video') {
  const source = mediaUrl(value)
  if (!source) throw new Error('The selected video model requires a media reference.')

  const dataUri = /^data:([^;,]+);base64,(.+)$/s.exec(source)
  if (dataUri) {
    const buffer = Buffer.from(dataUri[2], 'base64')
    if (!buffer.byteLength || buffer.byteLength > maximumBytes) {
      throw new Error(
        `Reference files must be between 1 byte and ${maximumBytes / 1024 / 1024} MB.`,
      )
    }
    return { mimeType: dataUri[1], base64: dataUri[2] }
  }

  const baseUrl =
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const url = new URL(source, baseUrl)
  const site = new URL(baseUrl)
  if (url.origin !== site.origin) {
    if (url.protocol !== 'https:') throw new Error('External media references must use HTTPS.')
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true })
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('References to private media URLs are blocked.')
    }
  }
  if (
    url.origin === site.origin &&
    ['localhost', '127.0.0.1'].includes(site.hostname) &&
    site.port !== (process.env.PORT || '3000')
  ) {
    url.hostname = '127.0.0.1'
    url.port = process.env.PORT || '3000'
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error('The reference image could not be downloaded.')
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`Reference files must be ${maximumBytes / 1024 / 1024} MB or smaller.`)
  }
  const buffer = await readResponseBytes(response, maximumBytes)
  if (!buffer.byteLength || buffer.byteLength > maximumBytes) {
    throw new Error(`Reference files must be between 1 byte and ${maximumBytes / 1024 / 1024} MB.`)
  }
  const mimeType =
    response.headers.get('content-type')?.split(';', 1)[0]?.trim() ||
    (expectedType === 'video' ? 'video/mp4' : 'image/png')
  return { mimeType, base64: buffer.toString('base64') }
}

async function imageData(value: unknown, maximumBytes = 10 * 1024 * 1024) {
  const file = await mediaData(value, maximumBytes, 'image')
  if (!file.mimeType.startsWith('image/')) throw new Error('Video references must be image files.')
  return file
}

async function providerMediaUri(value: unknown, type: 'image' | 'video', maximumBytes: number) {
  const source = mediaUrl(value)
  if (source.startsWith('https://')) return source
  const file = await mediaData(value, maximumBytes, type)
  if (!file.mimeType.startsWith(`${type}/`)) {
    throw new Error(`Video references must be ${type} files.`)
  }
  return `data:${file.mimeType};base64,${file.base64}`
}

async function downloadGoogleVideo(uri: string, apiKey: string, deadline: number) {
  const fileId = /\/files\/([^/:?]+)/.exec(new URL(uri).pathname)?.[1]
  if (fileId) {
    while (true) {
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files/${encodeURIComponent(fileId)}`,
        { headers: { 'x-goog-api-key': apiKey }, signal: requestTimeout(deadline) },
      )
      const file = await readJSON<{ state?: string; error?: { message?: string } }>(
        statusResponse,
        'Gemini video file',
      )
      if (file.state === 'ACTIVE') break
      if (file.state === 'FAILED') {
        throw new Error(file.error?.message || 'Gemini video file processing failed.')
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, deadline - Date.now())))
    }
  }
  const response = await fetch(uri, {
    headers: { 'x-goog-api-key': apiKey },
    signal: requestTimeout(deadline),
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`Google video download failed (${response.status}).`)
  const bytes = await readResponseBytes(response, 50 * 1024 * 1024)
  if (!bytes.byteLength) throw new Error('Google completed without video data.')
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0] || 'video/mp4'
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

async function runSeedance(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const token = requireKey('REPLICATE_API_TOKEN')
  const model = 'bytedance/seedance-2.5'
  const [owner, name] = model.split('/')
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: clampNumber(Math.floor(input.duration || 5), 4, 30),
    resolution: ['480p', '720p', '1080p'].includes(input.resolution) ? input.resolution : '720p',
    aspect_ratio: input.aspectRatio || '16:9',
    generate_audio: input.generateAudio,
  }
  if (input.image && input.video) {
    throw new Error('Seedance cannot combine a first-frame image with a reference video.')
  }
  if (input.image) {
    payload.image = await providerMediaUri(input.image, 'image', 5 * 1024 * 1024)
  }
  if (input.video) {
    payload.reference_videos = [await providerMediaUri(input.video, 'video', 5 * 1024 * 1024)]
  }

  const deadline = deadlineFor(input.timeoutMs)
  let response = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: payload }),
    signal: requestTimeout(deadline),
  })
  let prediction = await readJSON<{
    id?: string
    status?: string
    output?: unknown
    error?: string
    urls?: { get?: string }
  }>(response, 'Replicate')
  if (!prediction.id) throw new Error('Replicate did not return a prediction ID.')

  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status || '')) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, deadline - Date.now())))
    response = await fetch(
      prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: requestTimeout(deadline) },
    )
    prediction = await readJSON(response, 'Replicate')
  }
  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || `Replicate generation ${prediction.status}.`)
  }
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
  const url = mediaUrl(output)
  if (!url) throw new Error('Replicate completed without a video URL.')
  return { url, providerJobId: prediction.id, model }
}

async function runGeminiOmni(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const apiKey = requireKey('APP_GEMINI_API_KEY')
  const deadline = deadlineFor(input.timeoutMs)
  const parts: Array<Record<string, unknown>> = []
  if (input.image) {
    const reference = await imageData(input.image)
    parts.push({ type: 'image', data: reference.base64, mime_type: reference.mimeType })
  }
  parts.push({ type: 'text', text: input.prompt })

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      input: parts,
      response_format: {
        type: 'video',
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        duration: `${Math.floor(input.duration || 5)}s`,
        delivery: 'uri',
      },
    }),
    signal: requestTimeout(deadline),
  })
  const interaction = await readJSON<{
    id?: string
    status?: string
    steps?: Array<{
      type?: string
      content?: Array<{ type?: string; data?: string; uri?: string }>
    }>
  }>(response, 'Gemini Omni Flash')
  const video = interaction.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .find((content) => content.type === 'video')
  if (video?.data) {
    return {
      url: `data:video/mp4;base64,${video.data}`,
      providerJobId: interaction.id,
      model: input.model,
    }
  }
  if (video?.uri) {
    return {
      url: await downloadGoogleVideo(video.uri, apiKey, deadline),
      providerJobId: interaction.id,
      model: input.model,
    }
  }
  throw new Error('Gemini Omni Flash completed without a video output.')
}

async function runVeo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const apiKey = requireKey('APP_GEMINI_API_KEY')
  const deadline = deadlineFor(input.timeoutMs)
  const instance: Record<string, unknown> = { prompt: input.prompt }
  if (input.image) {
    const reference = await imageData(input.image)
    instance.image = { mimeType: reference.mimeType, bytesBase64Encoded: reference.base64 }
  }
  const supportedDurations = [4, 6, 8]
  const requestedDuration = Math.round(input.duration || 8)
  const durationSeconds = supportedDurations.reduce((closest, candidate) =>
    Math.abs(candidate - requestedDuration) < Math.abs(closest - requestedDuration)
      ? candidate
      : closest,
  )
  const createResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:predictLongRunning`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
          durationSeconds,
          sampleCount: 1,
        },
      }),
      signal: requestTimeout(deadline),
    },
  )
  let operation = await readJSON<{
    name?: string
    done?: boolean
    error?: { message?: string }
    response?: {
      generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> }
    }
  }>(createResponse, 'Veo 3.1 Fast')
  if (!operation.name) throw new Error('Veo did not return an operation ID.')

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, deadline - Date.now())))
    const pollResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operation.name}`,
      { headers: { 'x-goog-api-key': apiKey }, signal: requestTimeout(deadline) },
    )
    operation = await readJSON(pollResponse, 'Veo 3.1 Fast')
  }
  if (operation.error?.message) throw new Error(operation.error.message)
  const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  if (!uri) throw new Error('Veo completed without a video URL.')
  return {
    url: await downloadGoogleVideo(uri, apiKey, deadline),
    providerJobId: operation.name,
    model: input.model,
  }
}

const runwayRatios: Record<string, string> = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
  '4:3': '1104:832',
  '3:4': '832:1104',
  '21:9': '1584:672',
}

async function runRunway(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const apiKey = requireKey('RUNWAYML_API_SECRET')
  const deadline = deadlineFor(input.timeoutMs)
  const image = input.image
    ? await providerMediaUri(input.image, 'image', 5 * 1024 * 1024)
    : undefined
  const route = image ? 'image_to_video' : 'text_to_video'
  const body = {
    model: 'gen4.5',
    promptText: input.prompt,
    ratio: runwayRatios[input.aspectRatio] || runwayRatios['16:9'],
    duration: input.duration >= 8 ? 10 : 5,
    ...(image ? { promptImage: image } : {}),
  }
  const response = await fetch(`https://api.dev.runwayml.com/v1/${route}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: requestTimeout(deadline),
  })
  let task = await readJSON<{ id?: string; status?: string; output?: unknown; failure?: string }>(
    response,
    'Runway',
  )
  if (!task.id) throw new Error('Runway did not return a task ID.')

  while (!['SUCCEEDED', 'FAILED', 'CANCELED'].includes(task.status || '')) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, deadline - Date.now())))
    const pollResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
      signal: requestTimeout(deadline),
    })
    task = await readJSON(pollResponse, 'Runway')
  }
  if (task.status !== 'SUCCEEDED') {
    throw new Error(task.failure || `Runway video generation ${task.status}.`)
  }
  const output = Array.isArray(task.output) ? task.output[0] : task.output
  const url = mediaUrl(output)
  if (!url) throw new Error('Runway completed without a video URL.')
  return { url, providerJobId: task.id, model: 'gen4.5' }
}

export async function generateVideoWithProvider(
  input: VideoGenerationInput,
): Promise<VideoGenerationResult> {
  if (input.provider === 'replicate' && input.model === 'bytedance/seedance-2.5') {
    return runSeedance(input)
  }
  if (input.provider === 'gemini' && input.model === 'gemini-omni-1.1-flash') {
    return runGeminiOmni(input)
  }
  if (input.provider === 'gemini' && input.model === 'veo-3.1-fast-generate-preview') {
    return runVeo(input)
  }
  if (input.provider === 'runway' && input.model === 'gen4.5') {
    return runRunway(input)
  }
  throw new Error(`Unsupported video model “${input.provider} · ${input.model}”.`)
}

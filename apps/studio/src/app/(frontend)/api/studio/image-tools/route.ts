import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { withApiLogging } from '@/lib/server-logger'
import { AssetValidationError } from '@/server/modules/assets/application/asset-service'
import {
  resolveProviderKey,
  resolveProviderEndpoint,
  withProviderCredentials,
  type ProviderCredentials,
} from '@/server/modules/providers/credential-context'
import { transformImage } from '@/server/modules/assets/application/image-transforms'
import { downloadGeneratedMedia } from '@/server/modules/workflows/application/workflow-media-persister'

const maxFileBytes = 50 * 1024 * 1024
const pollIntervalMs = 15_000
const maximumTaskWaitMs = 5 * 60 * 1000
const sourceFields = {
  assetId: z.string().min(1).max(128),
  sourceName: z.string().trim().min(1).max(255),
  sourceAlt: z.string().max(2_000).optional(),
  credentials: z
    .object({
      keys: z.record(z.string(), z.string()).optional(),
      baseUrls: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
}

const requestSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...sourceFields,
      action: z.literal('crop'),
      crop: z
        .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('split'),
      columns: z.number().int().min(2).max(4),
      rows: z.number().int().min(2).max(4),
    })
    .strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('upscale'),
      scale: z.union([z.literal(2), z.literal(4)]),
      faceEnhance: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('super-resolution'),
      scale: z.union([z.literal(2), z.literal(4)]),
      faceEnhance: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...sourceFields, action: z.literal('describe') }).strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('mask-edit'),
      prompt: z.string().trim().min(1).max(32_000),
      mask: z.string().min(1).max(6_000_000),
    })
    .strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('variation'),
      prompt: z.string().trim().min(1).max(32_000),
    })
    .strict(),
  z
    .object({
      ...sourceFields,
      action: z.literal('angle'),
      direction: z.enum(['front', 'left', 'right', 'back', 'high', 'low']),
      prompt: z.string().trim().max(4_000).optional(),
    })
    .strict(),
])

type ReplicatePrediction = {
  id?: string
  status?: string
  output?: unknown
  error?: string
}

function outputURL(value: unknown) {
  const output = Array.isArray(value) ? value[0] : value
  if (typeof output === 'string') return output
  if (output && typeof output === 'object' && 'url' in output) {
    const url = (output as { url?: unknown }).url
    return typeof url === 'string' ? url : ''
  }
  return ''
}

async function runRealESRGAN(buffer: Buffer, mimeType: string, scale: 2 | 4, faceEnhance: boolean) {
  const token = resolveProviderKey('REPLICATE_API_TOKEN')
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const createResponse = await fetch(
    'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions',
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'wait=60' },
      body: JSON.stringify({
        input: {
          image: `data:${mimeType};base64,${buffer.toString('base64')}`,
          scale,
          face_enhance: faceEnhance,
        },
      }),
      signal: AbortSignal.timeout(65_000),
      redirect: 'error',
    },
  )
  let prediction = (await createResponse.json().catch(() => ({}))) as ReplicatePrediction
  if (!createResponse.ok) {
    throw new Error(
      prediction.error || `Replicate upscale request failed (${createResponse.status}).`,
    )
  }
  if (!prediction.id && prediction.status !== 'succeeded') {
    throw new Error('Replicate returned an invalid image task.')
  }

  const startedAt = Date.now()
  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status || '')) {
    if (Date.now() - startedAt >= maximumTaskWaitMs) {
      throw new Error(`Replicate image task ${prediction.id} is still processing. Retry later.`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const statusResponse = await fetch(
      `https://api.replicate.com/v1/predictions/${encodeURIComponent(prediction.id || '')}`,
      {
        headers: { Authorization: headers.Authorization },
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      },
    )
    prediction = (await statusResponse.json().catch(() => ({}))) as ReplicatePrediction
    if (!statusResponse.ok) {
      throw new Error(
        prediction.error || `Replicate task status failed (${statusResponse.status}).`,
      )
    }
  }
  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || `Replicate image task ${prediction.status}.`)
  }
  const url = outputURL(prediction.output)
  if (!url) throw new Error('Replicate completed without an image output.')
  return downloadGeneratedMedia(url, 'image', 'replicate')
}

function parseMask(maskDataUrl: string) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(maskDataUrl)
  if (!match) throw new Error('Draw an edit mask before applying the change.')
  const buffer = Buffer.from(match[1], 'base64')
  if (!buffer.length || buffer.length >= 4 * 1024 * 1024) {
    throw new Error('The PNG mask must be smaller than 4 MB.')
  }
  return buffer
}

function extractResponseText(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const response = value as {
    output_text?: unknown
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
  }
  if (typeof response.output_text === 'string') return response.output_text.trim()
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim()
}

async function describeImage(buffer: Buffer) {
  const token = resolveProviderKey('APP_OPENAI_API_KEY')
  const endpoint = await resolveProviderEndpoint('openai', 'v1/responses', 'https://api.openai.com')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      store: false,
      max_output_tokens: 700,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Describe this image with concrete visual details. Return only a concise draft prompt that a person can review and edit.',
            },
            {
              type: 'input_image',
              detail: 'high',
              image_url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
    redirect: 'error',
  })
  const result = (await response.json().catch(() => ({}))) as {
    output_text?: string
    output?: unknown
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(
      result.error?.message || `OpenAI image description failed (${response.status}).`,
    )
  }
  const description = extractResponseText(result)
  if (!description) throw new Error('OpenAI returned an empty image description.')
  return description
}

async function editImage(buffer: Buffer, prompt: string, mask?: Buffer) {
  const token = resolveProviderKey('APP_OPENAI_API_KEY')
  const endpoint = await resolveProviderEndpoint(
    'openai',
    'v1/images/edits',
    'https://api.openai.com',
  )
  const form = new FormData()
  form.set('model', 'gpt-image-2.5-sunburst')
  form.set('prompt', prompt)
  form.set('image', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), 'source.jpg')
  if (mask) form.set('mask', new Blob([new Uint8Array(mask)], { type: 'image/png' }), 'mask.png')
  form.set('output_format', 'png')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
    redirect: 'error',
  })
  const result = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(result.error?.message || `OpenAI image edit failed (${response.status}).`)
  }
  const output = result.data?.[0]
  if (output?.b64_json) {
    const outputBuffer = Buffer.from(output.b64_json, 'base64')
    if (!outputBuffer.length || outputBuffer.length > maxFileBytes) {
      throw new Error('OpenAI image output exceeds the 50 MB file limit.')
    }
    return {
      buffer: outputBuffer,
      mimetype: 'image/png',
      name: 'openai-edit.png',
      size: outputBuffer.length,
    }
  }
  if (output?.url) return downloadGeneratedMedia(output.url, 'image', 'openai')
  throw new Error('OpenAI completed without an image output.')
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : 'Image tool could not be completed.')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider URL]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g,
      '[credential]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [credential]')
    .slice(0, 2000)
}

async function createDerivedImage(request: Request) {
  let form: FormData
  let rawBody: unknown
  try {
    form = await request.formData()
    rawBody = JSON.parse(String(form.get('input') || ''))
  } catch {
    return Response.json(
      { error: 'Submit valid image tool settings and source image.', code: 'INVALID_IMAGE_TOOL' },
      { status: 400 },
    )
  }
  const parsed = requestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json(
      { error: 'Submit valid image tool settings.', code: 'INVALID_IMAGE_TOOL' },
      { status: 400 },
    )
  }
  const input = parsed.data
  const sourceFile = form.get('source')
  if (!(sourceFile instanceof File)) {
    return Response.json(
      { error: 'The source image is unavailable.', code: 'IMAGE_TOOL_FAILED' },
      { status: 400 },
    )
  }
  if (!sourceFile.type.startsWith('image/')) {
    return Response.json(
      { error: 'This tool requires an image file.', code: 'INVALID_IMAGE_TOOL' },
      { status: 415 },
    )
  }
  if (!sourceFile.size || sourceFile.size > maxFileBytes) {
    return Response.json(
      { error: 'Image files must be between 1 byte and 50 MB.', code: 'INVALID_IMAGE_TOOL' },
      { status: 413 },
    )
  }
  const source = Buffer.from(await sourceFile.arrayBuffer())
  const credentials: ProviderCredentials = {
    keys: input.credentials?.keys as ProviderCredentials['keys'],
    baseUrls: input.credentials?.baseUrls as ProviderCredentials['baseUrls'],
  }
  try {
    if (input.action === 'describe') {
      const normalizedSource = await sharp(source)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
      const description = await withProviderCredentials(credentials, () =>
        describeImage(normalizedSource),
      )
      return Response.json(
        { description, provider: 'openai', model: 'gpt-6-luna' },
        { status: 200 },
      )
    }

    let files: Array<{
      buffer: Buffer
      mimetype: string
      name: string
      size: number
      metadata: Record<string, unknown>
    }>
    if (input.action === 'crop' || input.action === 'split') {
      const transformed = await transformImage(source, input)
      files = transformed.map((item) => ({
        buffer: item.buffer,
        mimetype: 'image/png',
        name: `zenith-${item.suffix}-${randomUUID()}.png`,
        size: item.buffer.byteLength,
        metadata: { ...item.metadata, width: item.width, height: item.height },
      }))
    } else if (
      input.action === 'mask-edit' ||
      input.action === 'variation' ||
      input.action === 'angle'
    ) {
      const normalizedSource = await sharp(source).rotate().jpeg({ quality: 90 }).toBuffer()
      if (normalizedSource.byteLength > maxFileBytes) {
        throw new AssetValidationError('The prepared image must be 50 MB or smaller.', 413)
      }
      let maskBuffer: Buffer | undefined
      let prompt: string
      if (input.action === 'mask-edit') {
        maskBuffer = parseMask(input.mask)
        const [sourceMetadata, maskMetadata] = await Promise.all([
          sharp(normalizedSource).metadata(),
          sharp(maskBuffer).metadata(),
        ])
        if (
          !sourceMetadata.width ||
          !sourceMetadata.height ||
          sourceMetadata.width !== maskMetadata.width ||
          sourceMetadata.height !== maskMetadata.height
        ) {
          throw new Error('The edit mask must match the source image dimensions.')
        }
        prompt = input.prompt
      } else if (input.action === 'variation') {
        prompt = `Create a faithful visual variation of this image. Preserve the main subject, identity, and general composition while changing details according to this direction: ${input.prompt}`
      } else {
        const direction = {
          front: 'a straight-on front view',
          left: 'a three-quarter view from the left',
          right: 'a three-quarter view from the right',
          back: 'a view from behind',
          high: 'a high-angle view looking down',
          low: 'a low-angle view looking up',
        }[input.direction]
        prompt = `Create a new camera-angle view of the same subject: ${direction}. Preserve the subject identity, materials, lighting, and visual style.${input.prompt ? ` Additional direction: ${input.prompt}` : ''}`
      }
      const media = await withProviderCredentials(credentials, () =>
        editImage(normalizedSource, prompt, maskBuffer),
      )
      const metadata = await sharp(media.buffer).metadata()
      files = [
        {
          buffer: media.buffer,
          mimetype: media.mimetype,
          name: `zenith-${input.action}-${randomUUID()}.${media.name.split('.').pop() || 'png'}`,
          size: media.size,
          metadata: {
            action: input.action,
            provider: 'openai',
            model: 'gpt-image-2.5-sunburst',
            prompt,
            ...(input.action === 'angle' ? { direction: input.direction } : {}),
            ...(input.action === 'variation' ? { variationPrompt: input.prompt } : {}),
            ...(metadata.width ? { width: metadata.width } : {}),
            ...(metadata.height ? { height: metadata.height } : {}),
          },
        },
      ]
    } else if (input.action === 'upscale') {
      const sourceMetadata = await sharp(source).rotate().metadata()
      if (!sourceMetadata.width || !sourceMetadata.height) {
        throw new Error('The source image dimensions could not be read.')
      }
      const buffer = await sharp(source)
        .rotate()
        .resize({
          width: sourceMetadata.width * input.scale,
          height: sourceMetadata.height * input.scale,
          kernel: 'lanczos3',
        })
        .png()
        .toBuffer()
      const metadata = await sharp(buffer).metadata()
      files = [
        {
          buffer,
          mimetype: 'image/png',
          name: `zenith-upscale-${randomUUID()}.png`,
          size: buffer.byteLength,
          metadata: {
            action: input.action,
            provider: 'sharp',
            model: 'lanczos3',
            scale: input.scale,
            ...(metadata.width ? { width: metadata.width } : {}),
            ...(metadata.height ? { height: metadata.height } : {}),
          },
        },
      ]
    } else if (input.action === 'super-resolution') {
      const media = await withProviderCredentials(credentials, () =>
        runRealESRGAN(
          source,
          sourceFile.type || 'image/png',
          input.scale,
          input.faceEnhance ?? false,
        ),
      )
      const metadata = await sharp(media.buffer).metadata()
      files = [
        {
          buffer: media.buffer,
          mimetype: media.mimetype,
          name: `zenith-${input.action}-${randomUUID()}.${media.name.split('.').pop() || 'png'}`,
          size: media.size,
          metadata: {
            action: input.action,
            provider: 'replicate',
            model: 'nightmareai/real-esrgan',
            scale: input.scale,
            faceEnhance: input.faceEnhance ?? false,
            ...(metadata.width ? { width: metadata.width } : {}),
            ...(metadata.height ? { height: metadata.height } : {}),
          },
        },
      ]
    } else {
      throw new Error('Choose a supported image tool.')
    }

    const outputs = files.map((file, index) => {
      if (!file.size || file.size > maxFileBytes) {
        throw new AssetValidationError('Derived images must be between 1 byte and 50 MB each.', 413)
      }
      return {
        id: randomUUID(),
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        filename: file.name,
        mimeType: file.mimetype,
        filesize: file.size,
        alt: `${input.sourceAlt || input.sourceName} · ${input.action}${files.length > 1 ? ` ${index + 1}` : ''}`,
        source: 'derived' as const,
        derivedFrom: input.assetId,
        derivedMetadata: { ...file.metadata, sourceAsset: input.sourceName },
      }
    })
    return Response.json({ outputs }, { status: 201 })
  } catch (error) {
    const message = safeError(error)
    const status =
      error instanceof AssetValidationError
        ? error.statusCode
        : /crop area|split grids|selected grid/i.test(message)
          ? 400
          : /source image was not found/i.test(message)
            ? 404
            : 502
    return Response.json(
      { error: message, code: status === 400 ? 'INVALID_IMAGE_TOOL' : 'IMAGE_TOOL_FAILED' },
      { status },
    )
  }
}

export const POST = withApiLogging('/api/studio/image-tools', createDerivedImage)

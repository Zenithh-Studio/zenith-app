import 'server-only'

import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { registryByType, validateWorkflowDefinition } from '@znith/contracts'
import { clampNumber } from '@znith/utils'
import type {
  NodeExecutionRecord,
  NodeValue,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunResult,
} from '@znith/contracts'
import type { WorkflowRunOptions } from '../application/workflow-service.types'

export { workflowDefinitionSchema } from '@znith/contracts'

export type EngineResult = WorkflowRunResult

function resolveInputs(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  outputs: Map<string, Record<string, NodeValue>>,
) {
  const values: Record<string, NodeValue[]> = {}
  for (const edge of edges.filter((item) => item.target === node.id)) {
    const value = outputs.get(edge.source)?.[edge.sourceHandle]
    if (value) (values[edge.targetHandle] ??= []).push(value)
  }
  const definition = registryByType.get(node.type)
  for (const port of definition?.inputs ?? []) {
    if (port.required && !values[port.id]?.length)
      throw new Error(`Missing required input “${port.name}”.`)
    if (!port.multiple && (values[port.id]?.length ?? 0) > 1)
      throw new Error(`Input “${port.name}” accepts one value.`)
  }
  return values
}

const text = (value: unknown) => String(value ?? '')
const mediaURL = (value: unknown) =>
  value && typeof value === 'object' ? text((value as Record<string, unknown>).url) : text(value)
const absoluteMediaURL = (value: unknown) => {
  const url = mediaURL(value)
  if (!url) return ''
  const baseURL =
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const resolved = new URL(url, baseURL)
  const site = new URL(baseURL)

  if (
    resolved.origin === site.origin &&
    ['localhost', '127.0.0.1'].includes(site.hostname) &&
    site.port !== (process.env.PORT || '3000')
  ) {
    resolved.hostname = '127.0.0.1'
    resolved.port = process.env.PORT || '3000'
  }

  return resolved.toString()
}

function requireSecret(
  name:
    | 'APP_OPENAI_API_KEY'
    | 'APP_CHATGPT2API_API_KEY'
    | 'APP_MUSE2API_API_KEY'
    | 'APP_ANTHROPIC_API_KEY'
    | 'APP_GEMINI_API_KEY'
    | 'REPLICATE_API_TOKEN',
) {
  const value = process.env[name]
  if (!value)
    throw new Error(
      `${name.replace('APP_', '').replace('_API_KEY', '')} is not configured. Set the ${name} server environment variable.`,
    )
  return value
}

function chatGPT2APIEndpoint(path: 'images/generations' | 'images/edits') {
  const baseURL = process.env.APP_CHATGPT2API_BASE_URL
  if (!baseURL) {
    throw new Error(
      'ChatGPT2API is not configured. Set the APP_CHATGPT2API_BASE_URL server environment variable.',
    )
  }

  let url: URL
  try {
    url = new URL(`${baseURL.replace(/\/+$/, '')}/`)
  } catch {
    throw new Error('APP_CHATGPT2API_BASE_URL must be a valid absolute URL ending in /v1.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('APP_CHATGPT2API_BASE_URL must use HTTP or HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error(
      'Do not put credentials in APP_CHATGPT2API_BASE_URL; use APP_CHATGPT2API_API_KEY.',
    )
  }
  if (!url.pathname.replace(/\/+$/, '').endsWith('/v1')) {
    throw new Error('APP_CHATGPT2API_BASE_URL must point to the service /v1 API root.')
  }
  return new URL(path, url).toString()
}

type ImageAPIItem = NonNullable<ImageAPIResponse['data']>[number]

type ImageAPIResponse = {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
  error?: { message?: string }
}

function imageResultURL(image?: ImageAPIItem) {
  if (image?.url) return image.url
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`
  return ''
}

async function requestChatGPT2APIImage(input: {
  model: string
  prompt: string
  references?: NodeValue[]
}) {
  const apiKey = requireSecret('APP_CHATGPT2API_API_KEY')
  const references = input.references ?? []
  let response: Response

  if (references.length) {
    const form = new FormData()
    form.set('model', input.model)
    form.set('prompt', input.prompt)
    form.set('n', '1')
    form.set('response_format', 'b64_json')
    for (const [index, reference] of references.entries()) {
      const source = await fetch(absoluteMediaURL(reference.value))
      if (!source.ok) throw new Error(`Could not download reference image ${index + 1}.`)
      form.append(
        references.length > 1 ? 'image[]' : 'image',
        new Blob([await source.arrayBuffer()], {
          type: source.headers.get('content-type') || 'image/png',
        }),
        `reference-${index + 1}.png`,
      )
    }
    response = await fetch(chatGPT2APIEndpoint('images/edits'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } else {
    response = await fetch(chatGPT2APIEndpoint('images/generations'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        n: 1,
        response_format: 'b64_json',
      }),
    })
  }

  const payload = (await response.json()) as ImageAPIResponse
  if (!response.ok)
    throw new Error(
      payload.error?.message || `ChatGPT2API image request failed (${response.status}).`,
    )
  const image = payload.data?.[0]
  const url = imageResultURL(image)
  if (!url) throw new Error('ChatGPT2API completed without image data or a media URL.')
  return { url, revisedPrompt: image?.revised_prompt }
}

function muse2APIEndpoint(path = '') {
  const baseURL = process.env.APP_MUSE2API_BASE_URL
  if (!baseURL) {
    throw new Error(
      'Muse2API is not configured. Set the APP_MUSE2API_BASE_URL server environment variable.',
    )
  }

  let url: URL
  try {
    url = new URL(`${baseURL.replace(/\/+$/, '')}/`)
  } catch {
    throw new Error('APP_MUSE2API_BASE_URL must be a valid absolute URL ending in /v1.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('APP_MUSE2API_BASE_URL must use HTTP or HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error('Do not put credentials in APP_MUSE2API_BASE_URL; use APP_MUSE2API_API_KEY.')
  }
  if (url.search || url.hash || !url.pathname.replace(/\/+$/, '').endsWith('/v1')) {
    throw new Error('APP_MUSE2API_BASE_URL must point to the service /v1 API root.')
  }
  return new URL(path, url)
}

async function muse2APIReferenceImage(value: unknown) {
  const response = await fetch(absoluteMediaURL(value), {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error('Could not download the first-frame image for Muse2API.')

  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'image/png'
  if (!mimeType.startsWith('image/')) {
    throw new Error('Muse2API first-frame references must be image files.')
  }
  const maximumReferenceBytes = 10 * 1024 * 1024
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumReferenceBytes) {
    throw new Error('Muse2API first-frame images must be 10 MB or smaller.')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.byteLength || buffer.byteLength > maximumReferenceBytes) {
    throw new Error('Muse2API first-frame images must be between 1 byte and 10 MB.')
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

type Muse2APITask = {
  id?: string
  status?: string
  model?: string
  result?: { url?: string }
  error?: string | { message?: string }
  detail?: string
  message?: string
}

function muse2APIError(task: Muse2APITask, fallback: string) {
  if (typeof task.error === 'string' && task.error) return task.error
  if (task.error && typeof task.error === 'object' && task.error.message) return task.error.message
  return task.detail || task.message || fallback
}

async function runMuse2APIVideo(input: {
  model: string
  prompt: string
  aspectRatio: string
  duration: number
  referenceImage?: string
  timeoutMs: number
}) {
  const apiKey = requireSecret('APP_MUSE2API_API_KEY')
  const baseURL = muse2APIEndpoint()
  const deadline = Date.now() + clampNumber(input.timeoutMs || 300_000, 1_000, 900_000)
  const request = async (path: string, init: RequestInit) => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new Error('Muse2API video generation timed out.')
    return fetch(muse2APIEndpoint(path).toString(), {
      ...init,
      signal: AbortSignal.timeout(Math.min(remainingMs, 30_000)),
    })
  }
  const headers = { Authorization: `Bearer ${apiKey}` }
  const createResponse = await request('videos', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model || 'muse-video',
      prompt: input.prompt,
      size: input.aspectRatio,
      duration: Math.floor(clampNumber(input.duration || 5, 1, 60)),
      ...(input.referenceImage ? { image: input.referenceImage } : {}),
    }),
  })
  const createTask = (await createResponse.json()) as Muse2APITask
  if (!createResponse.ok) {
    throw new Error(
      muse2APIError(createTask, `Muse2API request failed (${createResponse.status}).`),
    )
  }
  if (!createTask.id) throw new Error('Muse2API did not return a video task ID.')

  let task = createTask
  const terminalStatuses = new Set(['succeeded', 'failed', 'canceled', 'cancelled', 'interrupted'])
  while (!terminalStatuses.has(task.status || '')) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new Error('Muse2API video generation timed out.')
    await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, remainingMs)))

    const pollResponse = await request(`videos/${encodeURIComponent(createTask.id)}`, {
      headers,
    })
    task = (await pollResponse.json()) as Muse2APITask
    if (!pollResponse.ok) {
      throw new Error(muse2APIError(task, `Muse2API task polling failed (${pollResponse.status}).`))
    }
  }

  if (task.status !== 'succeeded') {
    throw new Error(muse2APIError(task, `Muse2API video generation ${task.status}.`))
  }
  if (!task.result?.url) throw new Error('Muse2API completed without a video URL.')
  return {
    url: new URL(task.result.url, baseURL).toString(),
    providerJobId: createTask.id,
    model: task.model || input.model || 'muse-video',
  }
}

async function runReplicate(model: string, input: Record<string, unknown>) {
  const token = requireSecret('REPLICATE_API_TOKEN')
  if (!model.trim()) throw new Error('Select a Replicate model version before running this node.')
  let response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: model, input }),
  })
  let prediction = (await response.json()) as {
    id?: string
    status?: string
    output?: unknown
    error?: string
    urls?: { get?: string }
  }
  if (!response.ok)
    throw new Error(prediction.error || `Replicate request failed (${response.status}).`)
  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status || '')) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    response = await fetch(
      prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    prediction = await response.json()
  }
  if (prediction.status !== 'succeeded')
    throw new Error(prediction.error || `Replicate generation ${prediction.status}.`)
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
  const url = mediaURL(output)
  if (!url) throw new Error('Replicate completed without a media URL.')
  return { url, providerJobId: prediction.id }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Node timed out after ${timeoutMs} ms.`)),
      timeoutMs,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
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

async function assertPublicHTTPS(rawURL: string) {
  const url = new URL(rawURL)
  if (url.protocol !== 'https:') throw new Error('HTTP Request only allows HTTPS endpoints.')
  if (url.username || url.password) throw new Error('Credentials are not allowed in request URLs.')
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Requests to local or private networks are blocked.')
  }
  return url
}

async function callCustomProvider(
  node: WorkflowNode,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = await assertPublicHTTPS(text(node.config.endpoint))
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: node.config.model, ...payload }),
    redirect: 'error',
  })
  const result = (await response.json()) as Record<string, unknown>
  if (!response.ok)
    throw new Error(
      text(result.error || result.message || `Custom provider failed (${response.status}).`),
    )
  return result
}

async function runComfyUI(node: WorkflowNode, prompt: string) {
  const endpoint = await assertPublicHTTPS(text(node.config.endpoint))
  const workflowSource = text(node.config.workflow)
  if (!workflowSource)
    throw new Error('Paste a ComfyUI API workflow JSON before running this node.')
  let workflow: unknown
  try {
    workflow = JSON.parse(workflowSource.replaceAll('{{prompt}}', prompt.replaceAll('"', '\\"')))
  } catch {
    throw new Error('The ComfyUI workflow is not valid JSON.')
  }
  const submitURL = new URL('/prompt', endpoint)
  const submitted = await fetch(submitURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  const job = (await submitted.json()) as { prompt_id?: string; error?: string }
  if (!submitted.ok || !job.prompt_id)
    throw new Error(job.error || `ComfyUI submission failed (${submitted.status}).`)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const historyResponse = await fetch(new URL(`/history/${job.prompt_id}`, endpoint))
    const history = (await historyResponse.json()) as Record<
      string,
      {
        outputs?: Record<
          string,
          { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
        >
      }
    >
    const output = history[job.prompt_id]
    if (!output) continue
    const image = Object.values(output.outputs || {}).flatMap((value) => value.images || [])[0]
    if (!image) throw new Error('ComfyUI completed without a media output.')
    const view = new URL('/view', endpoint)
    view.searchParams.set('filename', image.filename)
    if (image.subfolder) view.searchParams.set('subfolder', image.subfolder)
    if (image.type) view.searchParams.set('type', image.type)
    return { url: view.toString(), providerJobId: job.prompt_id }
  }
  throw new Error('ComfyUI generation timed out.')
}

async function generateText(node: WorkflowNode, prompt: string) {
  const provider = text(node.config.provider || 'openai')
  const model = text(node.config.model)
  const system = text(node.config.systemPrompt)
  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': requireSecret('APP_ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(node.config.maxTokens) || 4096,
        system: system || undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const result = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
      error?: { message?: string }
      usage?: Record<string, number>
    }
    if (!response.ok)
      throw new Error(result.error?.message || `Anthropic failed (${response.status}).`)
    return {
      value: result.content?.find((item) => item.type === 'text')?.text || '',
      usage: result.usage,
    }
  }
  if (provider === 'gemini') {
    const key = requireSecret('APP_GEMINI_API_KEY')
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: Number(node.config.temperature ?? 0.7) },
        }),
      },
    )
    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
      usageMetadata?: Record<string, number>
    }
    if (!response.ok)
      throw new Error(result.error?.message || `Gemini failed (${response.status}).`)
    return {
      value: result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '',
      usage: result.usageMetadata,
    }
  }
  if (provider === 'custom-http') {
    const result = await callCustomProvider(node, { task: 'text', prompt, systemPrompt: system })
    return { value: text(result.text || result.output || result.content), usage: result.usage }
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireSecret('APP_OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      temperature: Number(node.config.temperature ?? 0.7),
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  })
  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
    usage?: Record<string, number>
  }
  if (!response.ok) throw new Error(result.error?.message || `OpenAI failed (${response.status}).`)
  return { value: result.choices?.[0]?.message?.content || '', usage: result.usage }
}

async function executeNode(
  node: WorkflowNode,
  inputs: Record<string, NodeValue[]>,
): Promise<Record<string, NodeValue>> {
  switch (node.type) {
    case 'input.text':
      return { text: { type: 'text' as const, value: text(node.config.value) } }
    case 'input.prompt':
      return { prompt: { type: 'text' as const, value: text(node.config.value) } }
    case 'input.json': {
      const value = JSON.parse(text(node.config.value))
      return { json: { type: 'json' as const, value } }
    }
    case 'input.image':
    case 'input.video': {
      const url = text(node.config.url)
      if (!url)
        throw new Error(
          `Upload a ${node.type === 'input.image' ? 'image' : 'video'} before running this node.`,
        )
      const type = node.type === 'input.image' ? 'image' : 'video'
      return {
        [type]: {
          type,
          value: {
            url,
            fileName: node.config.fileName,
            mimeType: node.config.mimeType,
          },
          assetId: text(node.config.assetId) || undefined,
        },
      }
    }
    case 'processing.template': {
      const value = text(inputs.input?.[0]?.value)
      return {
        text: {
          type: 'text' as const,
          value: text(node.config.template).replaceAll('{{input}}', value),
        },
      }
    }
    case 'processing.merge-text':
      return {
        text: {
          type: 'text' as const,
          value: (inputs.texts ?? [])
            .map((item) => text(item.value))
            .join(text(node.config.separator ?? '\n\n')),
        },
      }
    case 'processing.merge-json':
      return {
        json: {
          type: 'json',
          value: Object.assign(
            {},
            ...(inputs.items ?? []).map((item) =>
              item.value && typeof item.value === 'object' && !Array.isArray(item.value)
                ? item.value
                : {},
            ),
          ),
        },
      }
    case 'processing.transform-json': {
      const path = text(node.config.path).trim()
      const value = path
        ? path
            .split('.')
            .reduce<unknown>(
              (current, key) =>
                current && typeof current === 'object'
                  ? (current as Record<string, unknown>)[key]
                  : undefined,
              inputs.json[0].value,
            )
        : inputs.json[0].value
      if (value === undefined) throw new Error(`JSON path “${path}” was not found.`)
      return { json: { type: 'json', value } }
    }
    case 'utility.variable':
      return { value: { type: 'text', value: text(node.config.value) } }
    case 'utility.note':
      return { text: { type: 'text', value: text(node.config.value) } }
    case 'utility.http-request': {
      const url = await assertPublicHTTPS(text(node.config.url))
      const method = text(node.config.method || 'GET').toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method))
        throw new Error('HTTP Request method must be GET, POST, PUT, or PATCH.')
      const response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(inputs.body?.[0]?.value ?? {}),
        redirect: 'error',
      })
      if (!response.ok) throw new Error(`HTTP endpoint returned ${response.status}.`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json'))
        throw new Error('HTTP endpoint did not return JSON.')
      return {
        json: {
          type: 'json',
          value: await response.json(),
          metadata: { status: response.status, url: url.origin + url.pathname },
        },
      }
    }
    case 'utility.delay': {
      const milliseconds = clampNumber(Number(node.config.milliseconds) || 0, 0, 30_000)
      await new Promise((resolve) => setTimeout(resolve, milliseconds))
      return { output: inputs.input[0] }
    }
    case 'utility.debug':
    case 'output.preview':
      return { output: inputs.input[0] }
    case 'processing.compose-layout':
      return {
        image: {
          ...inputs.image[0],
          metadata: {
            ...inputs.image[0].metadata,
            layout: {
              fit: node.config.fit,
              aspectRatio: node.config.aspectRatio,
              background: node.config.background,
            },
          },
        },
      }
    case 'output.save-image':
      return {
        image: {
          ...inputs.image[0],
          metadata: { ...inputs.image[0].metadata, fileName: node.config.fileName },
        },
      }
    case 'output.save-video':
      return {
        video: {
          ...inputs.video[0],
          metadata: { ...inputs.video[0].metadata, fileName: node.config.fileName },
        },
      }
    case 'ai.analyze-image': {
      const provider = text(node.config.provider || 'openai')
      const imageURL = absoluteMediaURL(inputs.image[0].value)
      if (provider === 'custom-http') {
        const result = await callCustomProvider(node, {
          task: 'vision',
          prompt: text(node.config.prompt),
          image: imageURL,
        })
        return {
          text: { type: 'text', value: text(result.text || result.output || result.content) },
        }
      }
      if (provider === 'anthropic' || provider === 'gemini') {
        const source = await fetch(imageURL)
        if (!source.ok) throw new Error('Could not download the image for analysis.')
        const mimeType = source.headers.get('content-type') || 'image/png'
        const data = Buffer.from(await source.arrayBuffer()).toString('base64')
        if (provider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': requireSecret('APP_ANTHROPIC_API_KEY'),
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: text(node.config.model),
              max_tokens: 4096,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: mimeType, data } },
                    { type: 'text', text: text(node.config.prompt) },
                  ],
                },
              ],
            }),
          })
          const result = (await response.json()) as {
            content?: Array<{ type: string; text?: string }>
            error?: { message?: string }
          }
          if (!response.ok)
            throw new Error(result.error?.message || `Anthropic failed (${response.status}).`)
          return {
            text: {
              type: 'text',
              value: result.content?.find((item) => item.type === 'text')?.text || '',
            },
          }
        }
        const key = requireSecret('APP_GEMINI_API_KEY')
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(text(node.config.model))}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ inlineData: { mimeType, data } }, { text: text(node.config.prompt) }],
                },
              ],
            }),
          },
        )
        const result = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          error?: { message?: string }
        }
        if (!response.ok)
          throw new Error(result.error?.message || `Gemini failed (${response.status}).`)
        return {
          text: {
            type: 'text',
            value:
              result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '',
          },
        }
      }
      const apiKey = requireSecret('APP_OPENAI_API_KEY')
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: text(node.config.model || 'gpt-4o-mini'),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: text(node.config.prompt) },
                { type: 'image_url', image_url: { url: imageURL } },
              ],
            },
          ],
        }),
      })
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      if (!response.ok)
        throw new Error(payload.error?.message || `OpenAI request failed (${response.status}).`)
      return { text: { type: 'text', value: payload.choices?.[0]?.message?.content || '' } }
    }
    case 'ai.generate-image': {
      const provider = text(node.config.provider || 'openai')
      const prompt = text(inputs.prompt?.[0]?.value || node.config.prompt)
      if (!prompt.trim())
        throw new Error(
          'Add a Prompt Input connection or enter a prompt in the node configuration.',
        )
      if (provider === 'replicate') {
        const generated = await runReplicate(text(node.config.model), {
          prompt,
          ...(inputs.image?.length
            ? {
                image: absoluteMediaURL(inputs.image[0].value),
                images: inputs.image.map((item) => absoluteMediaURL(item.value)),
              }
            : {}),
          aspect_ratio: node.config.aspectRatio,
        })
        return {
          image: {
            type: 'image',
            value: { url: generated.url },
            metadata: { provider, providerJobId: generated.providerJobId },
          },
        }
      }
      if (provider === 'comfyui') {
        const generated = await runComfyUI(node, prompt)
        return {
          image: {
            type: 'image',
            value: { url: generated.url },
            metadata: { provider, providerJobId: generated.providerJobId },
          },
        }
      }
      if (provider === 'custom-http') {
        const result = await callCustomProvider(node, {
          task: 'image',
          prompt,
          image: inputs.image?.[0] ? absoluteMediaURL(inputs.image[0].value) : undefined,
          images: inputs.image?.map((item) => absoluteMediaURL(item.value)),
          aspectRatio: node.config.aspectRatio,
        })
        const url = mediaURL(result.url || result.output || result.data)
        if (!url) throw new Error('Custom provider completed without a media URL.')
        return { image: { type: 'image', value: { url }, metadata: { provider } } }
      }
      if (provider === 'chatgpt2api') {
        const generated = await requestChatGPT2APIImage({
          model: text(node.config.model || 'gpt-image-2'),
          prompt,
          references: inputs.image,
        })
        return {
          image: {
            type: 'image',
            value: { url: generated.url },
            metadata: {
              provider,
              model: text(node.config.model || 'gpt-image-2'),
              revisedPrompt: generated.revisedPrompt,
              referenceAssetIds: inputs.image?.map((item) => item.assetId).filter(Boolean),
            },
          },
        }
      }
      const apiKey = requireSecret('APP_OPENAI_API_KEY')
      const ratio = text(node.config.aspectRatio)
      const size = ratio === '16:9' ? '1792x1024' : ratio === '9:16' ? '1024x1792' : '1024x1024'
      if (inputs.image?.[0]) {
        const form = new FormData()
        form.set('model', text(node.config.model || 'dall-e-2'))
        form.set('prompt', prompt)
        form.set('response_format', 'url')
        for (const [index, item] of inputs.image.entries()) {
          const source = await fetch(absoluteMediaURL(item.value))
          if (!source.ok) throw new Error(`Could not download reference image ${index + 1}.`)
          form.append(
            inputs.image.length > 1 ? 'image[]' : 'image',
            new Blob([await source.arrayBuffer()], {
              type: source.headers.get('content-type') || 'image/png',
            }),
            `reference-${index + 1}.png`,
          )
        }
        const response = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        })
        const payload = (await response.json()) as {
          data?: Array<{ url?: string; revised_prompt?: string }>
          error?: { message?: string }
        }
        if (!response.ok)
          throw new Error(
            payload.error?.message || `OpenAI image edit failed (${response.status}).`,
          )
        const image = payload.data?.[0]
        if (!image?.url) throw new Error('The image provider completed without a downloadable URL.')
        return {
          image: {
            type: 'image',
            value: { url: image.url },
            metadata: {
              revisedPrompt: image.revised_prompt,
              referenceAssetIds: inputs.image.map((item) => item.assetId).filter(Boolean),
            },
          },
        }
      }
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: text(node.config.model || 'dall-e-3'),
          prompt,
          size,
          quality: node.config.quality,
          response_format: 'url',
          n: 1,
        }),
      })
      const payload = (await response.json()) as {
        data?: Array<{ url?: string; revised_prompt?: string }>
        error?: { message?: string }
      }
      if (!response.ok)
        throw new Error(
          payload.error?.message || `OpenAI image request failed (${response.status}).`,
        )
      const image = payload.data?.[0]
      if (!image?.url) throw new Error('The image provider completed without a downloadable URL.')
      return {
        image: {
          type: 'image',
          value: { url: image.url },
          metadata: { revisedPrompt: image.revised_prompt },
        },
      }
    }
    case 'ai.edit-image': {
      if (node.config.provider === 'chatgpt2api') {
        const generated = await requestChatGPT2APIImage({
          model: text(node.config.model || 'gpt-image-2'),
          prompt: text(inputs.prompt?.[0]?.value || node.config.prompt),
          references: inputs.image,
        })
        return {
          image: {
            type: 'image',
            value: { url: generated.url },
            metadata: {
              provider: 'chatgpt2api',
              model: text(node.config.model || 'gpt-image-2'),
              revisedPrompt: generated.revisedPrompt,
              referenceAssetIds: inputs.image?.map((item) => item.assetId).filter(Boolean),
            },
          },
        }
      }
      const apiKey = requireSecret('APP_OPENAI_API_KEY')
      const source = await fetch(absoluteMediaURL(inputs.image[0].value))
      if (!source.ok) throw new Error('Could not download the source image for editing.')
      const form = new FormData()
      form.set('model', text(node.config.model || 'gpt-image-1'))
      form.set('prompt', text(inputs.prompt?.[0]?.value || node.config.prompt))
      form.set(
        'image',
        new Blob([await source.arrayBuffer()], {
          type: source.headers.get('content-type') || 'image/png',
        }),
        'source.png',
      )
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })
      const payload = (await response.json()) as {
        data?: Array<{ url?: string; b64_json?: string }>
        error?: { message?: string }
      }
      if (!response.ok)
        throw new Error(payload.error?.message || `OpenAI image edit failed (${response.status}).`)
      const url = payload.data?.[0]?.url
      if (!url)
        throw new Error(
          'The configured model returned inline image data; configure a URL-output model or asset storage adapter.',
        )
      return { image: { type: 'image', value: { url } } }
    }
    case 'ai.generate-video':
    case 'ai.image-to-video': {
      const provider = text(node.config.provider || 'replicate')
      const prompt = text(inputs.prompt?.[0]?.value || node.config.prompt)
      if (!prompt.trim())
        throw new Error(
          'Add a Prompt Input connection or enter a prompt in the node configuration.',
        )
      if (provider === 'comfyui') {
        const generated = await runComfyUI(node, prompt)
        return {
          video: {
            type: 'video',
            value: { url: generated.url },
            metadata: { provider, providerJobId: generated.providerJobId },
          },
        }
      }
      if (provider === 'custom-http') {
        const result = await callCustomProvider(node, {
          task: 'video',
          prompt,
          image: inputs.image?.[0] ? absoluteMediaURL(inputs.image[0].value) : undefined,
          images: inputs.image?.map((item) => absoluteMediaURL(item.value)),
          video: inputs.video?.[0] ? absoluteMediaURL(inputs.video[0].value) : undefined,
          videos: inputs.video?.map((item) => absoluteMediaURL(item.value)),
          aspectRatio: node.config.aspectRatio,
          duration: Number(node.config.duration) || 5,
        })
        const url = mediaURL(result.url || result.output || result.data)
        if (!url) throw new Error('Custom provider completed without a media URL.')
        return { video: { type: 'video', value: { url }, metadata: { provider } } }
      }
      if (provider === 'muse2api') {
        if (inputs.image && inputs.image.length > 1) {
          throw new Error('Muse2API accepts one first-frame image per video request.')
        }
        if (inputs.video?.length) {
          throw new Error('Muse2API supports text-to-video and first-frame image-to-video only.')
        }
        const generated = await runMuse2APIVideo({
          model: text(node.config.model || 'muse-video'),
          prompt,
          aspectRatio: text(node.config.aspectRatio || '16:9'),
          duration: Number(node.config.duration) || 5,
          referenceImage: inputs.image?.[0]
            ? await muse2APIReferenceImage(inputs.image[0].value)
            : undefined,
          timeoutMs: Number(node.config.timeoutMs) || 300_000,
        })
        return {
          video: {
            type: 'video',
            value: { url: generated.url },
            metadata: {
              provider,
              model: generated.model,
              providerJobId: generated.providerJobId,
              referenceAssetId: inputs.image?.[0]?.assetId,
            },
          },
        }
      }
      const generated = await runReplicate(text(node.config.model), {
        prompt,
        ...(inputs.image?.length
          ? {
              image: absoluteMediaURL(inputs.image[0].value),
              images: inputs.image.map((item) => absoluteMediaURL(item.value)),
            }
          : {}),
        ...(inputs.video?.length
          ? {
              video: absoluteMediaURL(inputs.video[0].value),
              videos: inputs.video.map((item) => absoluteMediaURL(item.value)),
            }
          : {}),
        aspect_ratio: node.config.aspectRatio,
        duration: Number(node.config.duration) || 5,
      })
      return {
        video: {
          type: 'video',
          value: { url: generated.url },
          metadata: { provider: 'replicate', providerJobId: generated.providerJobId },
        },
      }
    }
    case 'ai.generate-text': {
      const generated = await generateText(node, text(inputs.prompt[0].value))
      return {
        text: {
          type: 'text' as const,
          value: generated.value,
          metadata: {
            provider: node.config.provider || 'openai',
            model: node.config.model,
            usage: generated.usage,
          },
        },
      }
    }
    default: {
      const definition = registryByType.get(node.type)
      throw new Error(
        definition?.unavailableReason || `No executor is registered for ${node.type}.`,
      )
    }
  }
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  targetNodeId?: string,
  options: WorkflowRunOptions = {},
): Promise<EngineResult> {
  const records: NodeExecutionRecord[] = []
  const logs: EngineResult['logs'] = []
  const outputs = new Map<string, Record<string, NodeValue>>()
  try {
    const sorted = validateWorkflowDefinition(definition, targetNodeId)
    const included = new Set(sorted.map((node) => node.id))
    const pending = new Map(sorted.map((node) => [node.id, node]))
    const finished = new Map<string, NodeExecutionRecord>()
    const concurrency = clampNumber(options.concurrency ?? 4, 1, 16)
    const persistRecord = async (record: NodeExecutionRecord) => {
      try {
        await options.onNodeRecord?.(record)
      } catch {
        logs.push({
          at: new Date().toISOString(),
          level: 'error',
          nodeId: record.nodeId,
          message: 'Could not persist execution progress for this node.',
        })
      }
    }

    const executeOne = async (node: WorkflowNode) => {
      const startedAt = new Date()
      const record: NodeExecutionRecord = {
        nodeId: node.id,
        status: 'running',
        startedAt: startedAt.toISOString(),
      }
      records.push(record)
      logs.push({
        at: startedAt.toISOString(),
        level: 'info',
        nodeId: node.id,
        message: `${node.name} started`,
      })
      const retryCount = clampNumber(Number(node.config.retryCount) || 0, 0, 5)
      const timeoutMs = clampNumber(Number(node.config.timeoutMs) || 120_000, 100, 300_000)
      let result: Record<string, NodeValue> | undefined
      let failureMessage: string | undefined
      let successfulAttempt = 0
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        try {
          result = await withTimeout(
            executeNode(node, resolveInputs(node, definition.edges, outputs)),
            timeoutMs,
          )
          successfulAttempt = attempt
          break
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Node execution failed.'
          if (attempt < retryCount) {
            const delay = Math.min(10_000, 400 * 2 ** attempt)
            logs.push({
              at: new Date().toISOString(),
              level: 'error',
              nodeId: node.id,
              message: `${node.name} attempt ${attempt + 1} failed; retrying in ${delay} ms: ${message}`,
            })
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          failureMessage = message
        }
      }

      if (!result) {
        record.status = 'failed'
        record.completedAt = new Date().toISOString()
        record.durationMs = Date.now() - startedAt.getTime()
        record.error = failureMessage || 'Node execution failed.'
        await persistRecord(record)
        return record
      }

      if (options.persistNodeOutputs) {
        try {
          const persistence = await options.persistNodeOutputs(node, result)
          result = persistence.outputs
          for (const warning of persistence.warnings ?? []) {
            logs.push({
              at: new Date().toISOString(),
              level: 'info',
              nodeId: node.id,
              message: `Output save warning: ${warning}`,
            })
          }
        } catch {
          logs.push({
            at: new Date().toISOString(),
            level: 'info',
            nodeId: node.id,
            message: 'Output save warning: the generated result remains in execution history.',
          })
        }
      }

      outputs.set(node.id, result)
      record.outputs = result
      record.status = 'succeeded'
      record.completedAt = new Date().toISOString()
      record.durationMs = Date.now() - startedAt.getTime()
      logs.push({
        at: record.completedAt,
        level: 'info',
        nodeId: node.id,
        message: `${node.name} completed${successfulAttempt ? ` after ${successfulAttempt + 1} attempts` : ''}`,
      })
      await persistRecord(record)
      return record
    }

    while (pending.size) {
      const ready = [...pending.values()].filter((node) => {
        const dependencies = definition.edges
          .filter((edge) => edge.target === node.id && included.has(edge.source))
          .map((edge) => edge.source)
        return dependencies.every((id) => finished.has(id))
      })
      if (!ready.length) throw new Error('Workflow scheduler could not resolve pending nodes.')

      for (let index = 0; index < ready.length; index += concurrency) {
        const batch = ready.slice(index, index + concurrency)
        await Promise.all(
          batch.map(async (node) => {
            pending.delete(node.id)
            const failedDependency = definition.edges
              .filter((edge) => edge.target === node.id && included.has(edge.source))
              .map((edge) => finished.get(edge.source))
              .find((record) => record?.status === 'failed' || record?.status === 'skipped')
            if (failedDependency) {
              const record: NodeExecutionRecord = {
                nodeId: node.id,
                status: 'skipped',
                error: 'Skipped because an upstream dependency did not succeed.',
              }
              records.push(record)
              await persistRecord(record)
              finished.set(node.id, record)
              return
            }
            const record = await executeOne(node)
            finished.set(node.id, record)
          }),
        )
      }
    }

    const failed = records.find((record) => record.status === 'failed')
    if (failed) {
      const message = failed.error || 'Workflow execution failed.'
      logs.push({ at: new Date().toISOString(), level: 'error', message, nodeId: failed.nodeId })
      return { status: 'failed', records, logs, error: message }
    }
    return { status: 'succeeded', records, logs }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow execution failed.'
    logs.push({ at: new Date().toISOString(), level: 'error', message })
    return { status: 'failed', records, logs, error: message }
  }
}

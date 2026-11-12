'use client'

import { workflowTemplates } from '@znith/contracts'
import type { NodeValue } from '@znith/contracts'
import {
  deleteMediaAssets,
  deleteRecord,
  getAssetFile,
  getRecord,
  getStorageEstimate,
  listRecords,
  putRecord,
  saveMediaAsset,
  updateRecord,
} from './studio-indexed-db'
import type { StudioRecord } from './studio-indexed-db'

const networkFetch = globalThis.fetch.bind(globalThis)
const PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'replicate',
  'runway',
  'chatgpt2api',
  'muse2api',
] as const

type ProviderId = (typeof PROVIDERS)[number]
type LocalSettings = StudioRecord & {
  locale: 'en' | 'vi'
  modelDefaults: Record<string, unknown>
  imagePreferences: Record<string, unknown>
  videoPreferences: Record<string, unknown>
  audioPreferences: Record<string, unknown>
  uiPreferences: Record<string, unknown>
  providerCredentials: Partial<Record<ProviderId, { apiKey?: string; baseUrl?: string }>>
}

const mediaUrlCache = new Map<string, string>()

const defaultSettings: LocalSettings = {
  id: 'current',
  locale: 'en',
  modelDefaults: {},
  imagePreferences: {},
  videoPreferences: {},
  audioPreferences: {},
  uiPreferences: {},
  providerCredentials: {},
}

async function readSettings(): Promise<LocalSettings> {
  return ((await getRecord('settings', 'current')) as LocalSettings | null) || defaultSettings
}

function publicSettings(settings: LocalSettings) {
  return {
    id: settings.id,
    locale: settings.locale,
    modelDefaults: settings.modelDefaults || {},
    imagePreferences: settings.imagePreferences || {},
    videoPreferences: settings.videoPreferences || {},
    audioPreferences: settings.audioPreferences || {},
    uiPreferences: settings.uiPreferences || {},
    providers: Object.fromEntries(
      PROVIDERS.map((id) => [
        id,
        {
          configured: Boolean(settings.providerCredentials?.[id]?.apiKey),
          endpointCustomized: Boolean(settings.providerCredentials?.[id]?.baseUrl),
        },
      ]),
    ),
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function notFound(message: string) {
  return json({ error: message }, 404)
}

function queryPage(values: StudioRecord[], params: URLSearchParams, defaultLimit: number) {
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
  const limit = Math.max(1, Math.min(100, Math.floor(Number(params.get('limit')) || defaultLimit)))
  return {
    docs: values.slice((page - 1) * limit, page * limit),
    page,
    totalDocs: values.length,
    totalPages: Math.max(1, Math.ceil(values.length / limit)),
  }
}

function matchesSearch(record: StudioRecord, search: string) {
  const needle = search.toLocaleLowerCase()
  return ['title', 'name', 'description', 'content', 'filename', 'alt'].some((field) =>
    String(record[field] || '')
      .toLocaleLowerCase()
      .includes(needle),
  )
}

function dataUrlToBlob(value: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value)
  if (!match) throw new Error('Generated media data could not be read.')
  const mimeType = match[1] || 'application/octet-stream'
  const bytes = match[2]
    ? Uint8Array.from(atob(match[3] || ''), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[3] || ''))
  return new Blob([bytes], { type: mimeType })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Local media could not be read.'))
    reader.readAsDataURL(blob)
  })
}

async function inlineBrowserMediaUrl(url: string) {
  if (!url.startsWith('blob:')) return url
  const response = await networkFetch(url)
  if (!response.ok) {
    throw new Error('A workflow reference image could not be read from browser storage.')
  }
  return blobToDataUrl(await response.blob())
}

function mediaData(value: NodeValue) {
  return value.value && typeof value.value === 'object'
    ? (value.value as Record<string, unknown>)
    : { url: value.value }
}

function createMediaObjectUrl(record: StudioRecord, blob: Blob) {
  const storageKey = typeof record.fileId === 'string' ? record.fileId : ''
  const cached = storageKey ? mediaUrlCache.get(storageKey) : mediaUrlCache.get(record.id)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  mediaUrlCache.set(record.id, url)
  if (storageKey) mediaUrlCache.set(storageKey, url)
  return url
}

async function mediaObjectUrl(
  record: StudioRecord,
  storedFile?: Awaited<ReturnType<typeof getAssetFile>>,
) {
  if (typeof record.fileId !== 'string') return String(record.url || '')
  const cached = mediaUrlCache.get(record.fileId)
  if (cached) return cached
  const file = storedFile ?? (await getAssetFile(record.fileId))
  return file?.blob ? createMediaObjectUrl(record, file.blob) : String(record.url || '')
}

/** Rebuild a current-page object URL from a stable media key or asset record. */
export async function resolveLocalMediaUrl(
  assetId: string,
  filename?: string,
  storageKey?: string,
) {
  if (typeof window === 'undefined') return null

  if (storageKey) {
    const fileId = storageKey.startsWith('media:') ? storageKey.slice('media:'.length) : storageKey
    const file = await getAssetFile(fileId)
    if (file?.blob) {
      return createMediaObjectUrl({ id: assetId || fileId, fileId }, file.blob)
    }
  }

  const asset = assetId ? await getRecord('media', assetId) : null
  if (asset && typeof asset.fileId === 'string') {
    const file = await getAssetFile(asset.fileId)
    if (file?.blob) return mediaObjectUrl(asset, file)
  }

  if (!filename) return null
  const assets = await listRecords<StudioRecord>('media', {
    index: 'createdAt',
    direction: 'prev',
  })
  const matchingAssets = assets.filter(
    (candidate) =>
      String(candidate.filename || '').toLocaleLowerCase() === filename.toLocaleLowerCase() &&
      typeof candidate.fileId === 'string',
  )
  for (const candidate of matchingAssets) {
    const file = await getAssetFile(String(candidate.fileId))
    if (file?.blob) return mediaObjectUrl(candidate, file)
  }
  return null
}

function generationOutputMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const safeText = (input: unknown, maximum = 200) =>
    typeof input === 'string'
      ? input
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, maximum)
      : ''
  const filename = safeText(source.filename, 120)
  const outputPath = safeText(source.outputPath, 240)
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/
  if (
    !filename ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) ||
    !outputPath ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(outputPath) ||
    outputPath.split('/').some((segment) => segment === '.' || segment === '..') ||
    typeof source.productionId !== 'string' ||
    !/^[A-Za-z0-9_-]{10,128}$/.test(source.productionId) ||
    typeof source.itemId !== 'string' ||
    !idPattern.test(source.itemId) ||
    !['master', 'image', 'motion'].includes(String(source.stage))
  ) {
    return null
  }
  return {
    filename,
    outputPath,
    productionId: source.productionId,
    productionProjectCode: safeText(source.projectCode, 80),
    productionItemId: source.itemId,
    productionStage: String(source.stage),
    title: safeText(source.title, 200) || filename,
    alt: safeText(source.alt, 500) || filename,
  }
}

async function productionsApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/productions') return null
  if (method === 'GET') {
    const id = url.searchParams.get('id')
    if (id) {
      const production = await getRecord('productions', id)
      return production ? json({ production }) : notFound('Production project not found.')
    }
    const docs = (await listRecords('productions', {
      index: 'updatedAt',
      direction: 'prev',
    })) as StudioRecord[]
    return json({ docs })
  }
  if (method !== 'PUT') return null
  const body = (await readJson(init)) as Record<string, unknown> | null
  if (
    !body ||
    typeof body.id !== 'string' ||
    !/^[A-Za-z0-9_-]{10,128}$/.test(body.id) ||
    typeof body.spreadsheetUrl !== 'string' ||
    !body.sheets ||
    typeof body.sheets !== 'object' ||
    typeof body.sourceHash !== 'string'
  ) {
    return json({ error: 'The production import record is invalid.' }, 400)
  }
  const current = await getRecord('productions', body.id)
  const now = new Date().toISOString()
  const production = {
    ...(current || {}),
    ...body,
    id: body.id,
    outputs:
      body.outputs && typeof body.outputs === 'object' ? body.outputs : current?.outputs || {},
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }
  await putRecord('productions', production)
  return json({ production })
}

async function persistMediaValue(value: NodeValue): Promise<NodeValue> {
  if (!['image', 'video', 'audio'].includes(value.type)) return value
  const data = mediaData(value)
  const sourceUrl = typeof data.url === 'string' ? data.url : ''
  if (value.assetId) {
    const existing = await getRecord('media', value.assetId)
    if (existing) {
      return {
        ...value,
        value: {
          ...data,
          url: await mediaObjectUrl(existing),
          ...(typeof existing.fileId === 'string' ? { storageKey: existing.fileId } : {}),
        },
        metadata: {
          ...(value.metadata || {}),
          ...(typeof existing.fileId === 'string' ? { storageKey: existing.fileId } : {}),
        },
      }
    }
  }
  let blob: Blob | undefined
  if (sourceUrl.startsWith('data:')) blob = dataUrlToBlob(sourceUrl)
  else if (sourceUrl.startsWith('blob:')) {
    const response = await networkFetch(sourceUrl)
    if (response.ok) blob = await response.blob()
  } else if (sourceUrl.startsWith('https://')) {
    const response = await networkFetch(sourceUrl).catch(() => null)
    if (response?.ok) blob = await response.blob()
  }
  if (!blob) return value

  const filename = String(data.fileName || `generated.${blob.type.split('/')[1] || 'bin'}`)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const record = {
    id,
    filename,
    title: filename,
    alt: String(data.alt || data.prompt || 'Generated media'),
    mimeType: String(data.mimeType || blob.type || 'application/octet-stream'),
    filesize: blob.size,
    source: 'studio',
    createdAt: now,
    updatedAt: now,
  }
  const saved = await saveMediaAsset(blob, record)
  const url = createMediaObjectUrl(saved, blob)
  return {
    ...value,
    assetId: id,
    value: {
      ...data,
      url,
      storageKey: saved.fileId,
      fileName: filename,
      mimeType: record.mimeType,
      bytes: blob.size,
    },
    metadata: {
      ...(value.metadata || {}),
      assetId: id,
      storageKey: saved.fileId,
      filename,
      mimeType: record.mimeType,
    },
  }
}

async function hydrateNodeValue(value: NodeValue): Promise<NodeValue> {
  const data = mediaData(value)
  const storageKey =
    (typeof data.storageKey === 'string' && data.storageKey) ||
    (typeof data.fileId === 'string' && data.fileId) ||
    (typeof value.metadata?.storageKey === 'string' && value.metadata.storageKey) ||
    ''
  if (storageKey) {
    const url = await resolveLocalMediaUrl('', undefined, storageKey)
    if (url) return { ...value, value: { ...data, url, storageKey } }
  }
  if (!value.assetId) return value
  const record = await getRecord('media', value.assetId)
  if (!record) return value
  return {
    ...value,
    value: {
      ...data,
      url: await mediaObjectUrl(record),
      ...(typeof record.fileId === 'string' ? { storageKey: record.fileId } : {}),
    },
    metadata: {
      ...(value.metadata || {}),
      ...(typeof record.fileId === 'string' ? { storageKey: record.fileId } : {}),
    },
  }
}

async function hydrateExecution<T extends StudioRecord>(execution: T) {
  const records = Array.isArray(execution.nodeRecords)
    ? (execution.nodeRecords as Array<Record<string, unknown>>)
    : []
  const nodeRecords = await Promise.all(
    records.map(async (record) => {
      if (!record.outputs || typeof record.outputs !== 'object') return record
      const outputs = Object.fromEntries(
        await Promise.all(
          Object.entries(record.outputs as Record<string, NodeValue>).map(async ([key, value]) => [
            key,
            await hydrateNodeValue(value),
          ]),
        ),
      )
      return { ...record, outputs }
    }),
  )
  return { ...execution, nodeRecords }
}

async function persistMediaDocument(asset: StudioRecord) {
  const sourceUrl = typeof asset.url === 'string' ? asset.url : ''
  if (typeof asset.fileId === 'string' && (await getAssetFile(asset.fileId))) {
    const existing = {
      ...asset,
      source: asset.source || 'studio',
      storageKey: asset.fileId,
    }
    await putRecord('media', existing)
    return { ...existing, url: await mediaObjectUrl(existing) }
  }
  let blob: Blob | undefined
  if (sourceUrl.startsWith('data:')) blob = dataUrlToBlob(sourceUrl)
  else if (sourceUrl.startsWith('https://')) {
    const response = await networkFetch(sourceUrl).catch(() => null)
    if (response?.ok) blob = await response.blob()
  }
  if (!blob) return asset
  const id = asset.id
  const filename = String(asset.filename || `generated.${blob.type.split('/')[1] || 'bin'}`)
  const record = {
    ...asset,
    id,
    filename,
    title: String(asset.title || filename),
    mimeType: String(asset.mimeType || blob.type || 'application/octet-stream'),
    filesize: blob.size,
    source: asset.source || 'studio',
    updatedAt: new Date().toISOString(),
  }
  const saved = await saveMediaAsset(blob, record)
  const url = createMediaObjectUrl(saved, blob)
  return { ...saved, storageKey: saved.fileId, url }
}

async function generationsApi(url: URL, method: string, init?: RequestInit) {
  const statusMatch = url.pathname.match(/^\/api\/studio\/generations\/([^/]+)\/status$/)
  if (statusMatch && method === 'POST') {
    const generation = await getRecord('generations', decodeURIComponent(statusMatch[1]!))
    if (!generation) return notFound('Generation not found.')
    return json({ generation })
  }
  if (url.pathname !== '/api/studio/generations') return null
  if (method === 'GET') {
    const modality = url.searchParams.get('modality')
    const filtered = modality
      ? ((await listRecords('generations', {
          index: 'modalityCreatedAt',
          query: IDBKeyRange.bound([modality, ''], [modality, '\uffff']),
          direction: 'prev',
        })) as StudioRecord[])
      : ((await listRecords('generations', {
          index: 'createdAt',
          direction: 'prev',
        })) as StudioRecord[])
    const hydrated = await Promise.all(
      filtered.map(async (generation) => {
        const outputs = Array.isArray(generation.outputs)
          ? (generation.outputs as Array<Record<string, unknown>>)
          : []
        return {
          ...generation,
          outputs: await Promise.all(
            outputs.map(async (output) => {
              const asset =
                output.value && typeof output.value === 'object'
                  ? (output.value as StudioRecord)
                  : null
              return asset
                ? { ...output, value: { ...asset, url: await mediaObjectUrl(asset) } }
                : output
            }),
          ),
        }
      }),
    )
    return json({ generations: hydrated })
  }
  if (method !== 'POST') return null
  const requested = (await readJson(init)) as Record<string, unknown> | null
  if (!requested) return json({ error: 'Enter valid generation settings.' }, 400)
  const outputMetadata = generationOutputMetadata(requested.outputMetadata)
  let input = { ...requested }
  delete input.outputMetadata
  if (typeof input.retryOf === 'string') {
    const previous = await getRecord('generations', input.retryOf)
    const snapshot = previous?.inputSnapshot as Record<string, unknown> | undefined
    const node = snapshot?.node as Record<string, unknown> | undefined
    const config = node?.config as Record<string, unknown> | undefined
    if (!previous || !config)
      return json({ error: 'This generation does not have saved settings to retry.' }, 400)
    input = {
      modality: previous.modality,
      provider: config.provider,
      model: config.model,
      prompt: config.prompt,
      systemPrompt: config.systemPrompt,
      userPrompt: config.userPrompt,
      aspectRatio: config.aspectRatio,
      quality: config.quality,
      duration: config.duration,
      resolution: config.resolution,
      size: config.size,
      count: config.count,
      generateAudio: config.generateAudio,
      voice: config.voice,
      format: config.format,
      speed: config.speed,
      instructions: config.instructions,
      referenceAssetIds: snapshot?.referenceAssetIds || [],
    }
  }
  const referenceIds = Array.isArray(input.referenceAssetIds)
    ? input.referenceAssetIds.filter((id): id is string => typeof id === 'string')
    : []
  const references = [] as Array<Record<string, unknown>>
  for (const id of referenceIds) {
    const asset = await getRecord('media', id)
    if (!asset) return json({ error: 'One or more references are unavailable.' }, 400)
    const mimeType = String(asset.mimeType || '')
    const type = mimeType.startsWith('video/')
      ? 'video'
      : mimeType.startsWith('image/')
        ? 'image'
        : ''
    if (!type) return json({ error: 'Choose image or supported video reference files.' }, 415)
    const file = typeof asset.fileId === 'string' ? await getAssetFile(asset.fileId) : null
    const value = file?.blob
      ? { url: await blobToDataUrl(file.blob), fileName: asset.filename, mimeType }
      : { url: asset.url, fileName: asset.filename, mimeType }
    references.push({ id, type, value, metadata: { filename: asset.filename, mimeType } })
  }
  const credentials = await readLocalProviderCredentials()
  const credentialPayload = {
    keys: Object.fromEntries(
      Object.entries(credentials)
        .map(([key, value]) => [key, value?.apiKey])
        .filter(([, value]) => Boolean(value)),
    ),
    baseUrls: Object.fromEntries(
      Object.entries(credentials)
        .map(([key, value]) => [key, value?.baseUrl])
        .filter(([, value]) => Boolean(value)),
    ),
  }
  const response = await networkFetch(new URL('/api/studio/run/generations', url.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      referenceAssetIds: referenceIds,
      references,
      credentials: credentialPayload,
    }),
  })
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!result.generation || typeof result.generation !== 'object')
    return json(result, response.status)
  const generation = result.generation as StudioRecord
  const outputs = Array.isArray(generation.outputs)
    ? (generation.outputs as Array<Record<string, unknown>>)
    : []
  const localOutputs = await Promise.all(
    outputs.map(async (output) => {
      const asset =
        output.value && typeof output.value === 'object' ? (output.value as StudioRecord) : null
      if (!asset) return output
      const persisted = await persistMediaDocument(asset)
      if (!outputMetadata) return { ...output, value: persisted }
      const labeled: StudioRecord = {
        ...persisted,
        filename: outputMetadata.filename,
        title: outputMetadata.title,
        alt: outputMetadata.alt,
        productionId: outputMetadata.productionId,
        productionProjectCode: outputMetadata.productionProjectCode,
        productionItemId: outputMetadata.productionItemId,
        productionStage: outputMetadata.productionStage,
        productionOutputPath: outputMetadata.outputPath,
        updatedAt: new Date().toISOString(),
      }
      await putRecord('media', labeled)
      return { ...output, value: { ...labeled, url: await mediaObjectUrl(labeled) } }
    }),
  )
  const localGeneration = {
    ...generation,
    ...(typeof requested.retryOf === 'string' ? { retryOf: requested.retryOf } : {}),
    outputs: localOutputs,
    inputSnapshot: generation.inputSnapshot || { node: null, referenceAssetIds: referenceIds },
  }
  await putRecord('generations', localGeneration)
  return json({ ...result, generation: localGeneration }, response.status)
}

async function hydrateWorkflow(workflow: StudioRecord): Promise<StudioRecord> {
  async function walk(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(walk))
    if (!value || typeof value !== 'object') return value
    const object = value as Record<string, unknown>
    if (typeof object.assetId === 'string' && 'value' in object) {
      const hydrated = await hydrateNodeValue(object as unknown as NodeValue)
      const data = mediaData(hydrated)
      return {
        ...hydrated,
        value: { ...data, url: await inlineBrowserMediaUrl(String(data.url || '')) },
      }
    }
    const storageKey =
      (typeof object.storageKey === 'string' && object.storageKey) ||
      (typeof object.fileId === 'string' && object.fileId) ||
      ''
    if (storageKey) {
      const fileId = storageKey.startsWith('media:')
        ? storageKey.slice('media:'.length)
        : storageKey
      const file = await getAssetFile(fileId)
      if (file?.blob) {
        const record =
          typeof object.assetId === 'string' ? await getRecord('media', object.assetId) : null
        return {
          ...object,
          url: await blobToDataUrl(file.blob),
          ...(record && typeof record.fileId === 'string' ? { storageKey: record.fileId } : {}),
        }
      }
    }
    if (typeof object.assetId === 'string') {
      const record = await getRecord('media', object.assetId)
      return record
        ? {
            ...object,
            ...(typeof record.fileId === 'string' ? { storageKey: record.fileId } : {}),
            url: await inlineBrowserMediaUrl(await mediaObjectUrl(record)),
          }
        : object
    }
    if (typeof object.url === 'string' && object.url.startsWith('blob:')) {
      return { ...object, url: await inlineBrowserMediaUrl(object.url) }
    }
    return Object.fromEntries(
      await Promise.all(
        Object.entries(object).map(async ([key, child]) => [key, await walk(child)]),
      ),
    )
  }
  return (await walk(workflow)) as StudioRecord
}

async function persistExecution(execution: StudioRecord) {
  const copy = structuredClone(execution)
  const records = Array.isArray(copy.nodeRecords)
    ? (copy.nodeRecords as Array<Record<string, unknown>>)
    : []
  copy.nodeRecords = await Promise.all(
    records.map(async (record) => {
      if (!record.outputs || typeof record.outputs !== 'object') return record
      const outputs = Object.fromEntries(
        await Promise.all(
          Object.entries(record.outputs as Record<string, NodeValue>).map(async ([key, value]) => [
            key,
            await persistMediaValue(value),
          ]),
        ),
      )
      return { ...record, outputs }
    }),
  )
  await putRecord('executions', copy)
  return hydrateExecution(copy)
}

async function workflowsApi(url: URL, method: string, init?: RequestInit) {
  const route = url.pathname.match(/^\/api\/studio\/workflows(?:\/([^/]+))?$/)
  if (!route) return null
  const id = route[1] ? decodeURIComponent(route[1]) : undefined

  if (method === 'GET' && !id) {
    const search = url.searchParams.get('search')?.trim() || ''
    let docs = (await listRecords('workflows', {
      index: 'updatedAt',
      direction: 'prev',
    })) as StudioRecord[]
    if (search) docs = docs.filter((workflow) => matchesSearch(workflow, search))
    return json({ docs })
  }
  if (method === 'POST' && !id) {
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body) return json({ error: 'Enter valid workflow details.' }, 400)
    const templateId = String(body.templateId || 'blank')
    const template = workflowTemplates[templateId] || workflowTemplates.blank
    const now = new Date().toISOString()
    const workflow = {
      id: crypto.randomUUID(),
      name: String(body.name || template.name),
      description: String(body.description || template.description),
      category: template.category,
      status: 'idle',
      definition: body.definition || structuredClone(template.definition),
      createdAt: now,
      updatedAt: now,
    }
    await putRecord('workflows', workflow)
    return json({ workflow }, 201)
  }
  if (!id) return null

  const workflow = (await getRecord('workflows', id)) as StudioRecord | null
  if (method === 'GET') {
    if (!workflow) return notFound('Workflow not found.')
    let history = (await listRecords('executions', {
      index: 'workflowStartedAt',
      query: IDBKeyRange.bound([id, ''], [id, '\uffff']),
      direction: 'prev',
      limit: 20,
    })) as StudioRecord[]
    if (!history.length) {
      history = ((await listRecords('executions')) as StudioRecord[])
        .filter((entry) => entry.workflowId === id || entry.workflow === id)
        .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
        .slice(0, 20)
    }
    return json({
      workflow: await hydrateWorkflow(workflow),
      executions: await Promise.all(history.map(hydrateExecution)),
    })
  }
  if (method === 'PATCH') {
    if (!workflow) return notFound('Workflow not found.')
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body) return json({ error: 'Enter valid workflow details.' }, 400)
    const next = { ...workflow, ...body, id, updatedAt: new Date().toISOString() }
    await putRecord('workflows', next)
    return json({ workflow: next })
  }
  if (method === 'DELETE') {
    if (!workflow) return notFound('Workflow not found.')
    let related = (await listRecords('executions', {
      index: 'workflowId',
      query: id,
    })) as StudioRecord[]
    if (!related.length) {
      related = ((await listRecords('executions')) as StudioRecord[]).filter(
        (entry) => entry.workflowId === id || entry.workflow === id,
      )
    }
    await deleteRecord('workflows', id)
    await Promise.all(related.map((entry) => deleteRecord('executions', entry.id)))
    return new Response(null, { status: 204 })
  }
  return null
}

async function automationsApi(url: URL, method: string, init?: RequestInit) {
  const route = url.pathname.match(/^\/api\/studio\/automations(?:\/([^/]+))?$/)
  if (!route) return null
  const id = route[1] ? decodeURIComponent(route[1]) : undefined

  if (method === 'GET' && !id) {
    const docs = (await listRecords('automations', {
      index: 'updatedAt',
      direction: 'prev',
    })) as StudioRecord[]
    return json({ docs })
  }
  if (method === 'POST' && !id) {
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body) return json({ error: 'Enter valid automation details.' }, 400)
    const now = new Date().toISOString()
    const automation = {
      id: crypto.randomUUID(),
      name: String(body.name || 'Untitled automation')
        .trim()
        .slice(0, 120),
      workflowId: '',
      records: [{ id: crypto.randomUUID(), userPrompt: '', result: null, status: 'idle' }],
      createdAt: now,
      updatedAt: now,
    }
    await putRecord('automations', automation)
    return json({ automation }, 201)
  }
  if (!id) return null

  const automation = (await getRecord('automations', id)) as StudioRecord | null
  if (method === 'GET') {
    return automation ? json({ automation }) : notFound('Automation not found.')
  }
  if (method === 'PATCH') {
    if (!automation) return notFound('Automation not found.')
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body) return json({ error: 'Enter valid automation settings.' }, 400)
    if (Array.isArray(body.records) && body.records.length > 20) {
      return json({ error: 'An automation can contain at most 20 user prompts.' }, 400)
    }
    const records = Array.isArray(body.records)
      ? body.records.map((entry) => {
          const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
          return {
            id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
            userPrompt: typeof row.userPrompt === 'string' ? row.userPrompt.slice(0, 50_000) : '',
            result:
              row.result && typeof row.result === 'object' ? (row.result as StudioRecord) : null,
            status:
              row.status === 'running' || row.status === 'failed' || row.status === 'succeeded'
                ? row.status
                : 'idle',
            ...(typeof row.error === 'string' && row.error
              ? { error: row.error.slice(0, 2000) }
              : {}),
          }
        })
      : undefined
    const next: StudioRecord = {
      ...automation,
      ...(typeof body.name === 'string' ? { name: body.name.trim().slice(0, 120) } : {}),
      ...(typeof body.workflowId === 'string' ? { workflowId: body.workflowId } : {}),
      ...(records ? { records } : {}),
      updatedAt: new Date().toISOString(),
    }
    await putRecord('automations', next)
    return json({ automation: next })
  }
  if (method === 'DELETE') {
    if (!automation) return notFound('Automation not found.')
    await deleteRecord('automations', id)
    return new Response(null, { status: 204 })
  }
  return null
}

async function workflowSubrouteApi(url: URL, method: string, init?: RequestInit) {
  const match = url.pathname.match(
    /^\/api\/studio\/workflows\/([^/]+)\/(execute|status|save-output)$/,
  )
  if (!match) return null
  const id = decodeURIComponent(match[1]!)
  const action = match[2]
  if (action === 'execute' && method === 'DELETE') return networkFetch(url, init)
  if (action === 'execute' && method === 'POST') {
    const workflow = await getRecord('workflows', id)
    if (!workflow) return notFound('Workflow not found.')
    const input = (await readJson(init)) as Record<string, unknown> | null
    const { workflowDefinition, ...executionInput } = input || {}
    const credentials = await readLocalProviderCredentials()
    const definition =
      workflowDefinition &&
      typeof workflowDefinition === 'object' &&
      !Array.isArray(workflowDefinition)
        ? workflowDefinition
        : workflow.definition
    const hydrated = await hydrateWorkflow({ ...workflow, definition })
    const credentialPayload = {
      keys: Object.fromEntries(
        Object.entries(credentials)
          .map(([key, value]) => [key, value?.apiKey])
          .filter(([, value]) => Boolean(value)),
      ),
      baseUrls: Object.fromEntries(
        Object.entries(credentials)
          .map(([key, value]) => [key, value?.baseUrl])
          .filter(([, value]) => Boolean(value)),
      ),
    }
    const response = await networkFetch(url, {
      ...init,
      body: JSON.stringify({
        ...executionInput,
        workflow: hydrated,
        credentials: credentialPayload,
      }),
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (result.execution && typeof result.execution === 'object') {
      const execution = await persistExecution(result.execution as StudioRecord)
      const completedAt = new Date().toISOString()
      await putRecord('workflows', {
        ...workflow,
        status: result.status || 'failed',
        lastExecutionAt: completedAt,
        updatedAt: completedAt,
      })
      return json(
        { ...result, execution, records: execution.nodeRecords || result.records },
        response.status,
      )
    }
    return json(result, response.status)
  }
  if (action === 'status' && method === 'POST') {
    const body = (await readJson(init)) as { executionId?: unknown } | null
    const execution =
      typeof body?.executionId === 'string' ? await getRecord('executions', body.executionId) : null
    if (!execution || (execution.workflowId !== id && execution.workflow !== id))
      return notFound('Workflow task not found.')
    return json({ status: execution.status, execution: await hydrateExecution(execution) })
  }
  if (action === 'save-output' && method === 'POST') {
    const body = (await readJson(init)) as { nodeId?: unknown; executionId?: unknown } | null
    if (typeof body?.nodeId !== 'string')
      return json({ error: 'Choose a valid workflow node.' }, 400)
    const executions = await listRecords('executions')
    const execution = executions.find(
      (item) =>
        (item.workflowId === id || item.workflow === id) &&
        (typeof body.executionId !== 'string' || item.id === body.executionId),
    )
    const records = execution?.nodeRecords as Array<Record<string, unknown>> | undefined
    const record = records?.find((item) => item.nodeId === body.nodeId)
    if (!execution || !records || !record?.outputs || typeof record.outputs !== 'object')
      return notFound('Generated output was not found.')
    const outputs = Object.fromEntries(
      await Promise.all(
        Object.entries(record.outputs as Record<string, NodeValue>).map(async ([key, value]) => [
          key,
          await persistMediaValue(value),
        ]),
      ),
    )
    const nextRecords = records.map((item) =>
      item.nodeId === body.nodeId ? { ...item, outputs } : item,
    )
    await putRecord('executions', {
      ...execution,
      nodeRecords: nextRecords,
      updatedAt: new Date().toISOString(),
    })
    return json({ executionId: execution.id, nodeId: body.nodeId, outputs })
  }
  return null
}

async function promptsApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/prompts') return null
  let prompts = (await listRecords('prompts', {
    index: 'updatedAt',
    direction: 'prev',
  })) as StudioRecord[]
  if (method === 'GET') {
    const id = url.searchParams.get('id')
    if (id) {
      const prompt = prompts.find((item) => item.id === id)
      return prompt ? json({ prompt }) : notFound('The prompt was not found.')
    }
    const search = url.searchParams.get('search')?.trim() || ''
    const category = url.searchParams.get('category')?.trim() || ''
    if (search) prompts = prompts.filter((item) => matchesSearch(item, search))
    if (category) prompts = prompts.filter((item) => item.category === category)
    const page = queryPage(prompts, url.searchParams, 100)
    return json(page)
  }
  if (method === 'POST' || method === 'PUT') {
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body || typeof body.title !== 'string' || typeof body.content !== 'string') {
      return json({ error: 'Enter a title and prompt content.' }, 400)
    }
    const id = method === 'PUT' ? String(body.id || '') : crypto.randomUUID()
    if (!id) return json({ error: 'A prompt ID is required.' }, 400)
    const current = prompts.find((item) => item.id === id)
    if (method === 'PUT' && !current) return notFound('The prompt was not found.')
    const now = new Date().toISOString()
    const prompt = {
      ...(current || {}),
      ...body,
      id,
      title: body.title.trim(),
      content: body.content.trim(),
      tags: Array.isArray(body.tags) ? body.tags.map((tag) => ({ tag: String(tag).trim() })) : [],
      createdAt: current?.createdAt || now,
      updatedAt: now,
    }
    await putRecord('prompts', prompt)
    return json({ prompt }, method === 'POST' ? 201 : 200)
  }
  if (method === 'DELETE') {
    const body = (await readJson(init)) as { id?: unknown } | null
    if (typeof body?.id !== 'string' || !body.id)
      return json({ error: 'A prompt ID is required.' }, 400)
    await deleteRecord('prompts', body.id)
    return json({ deletedId: body.id })
  }
  return null
}

async function textAssetsApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/text-assets') return null
  let assets = (await listRecords('textAssets', {
    index: 'updatedAt',
    direction: 'prev',
  })) as StudioRecord[]
  if (method === 'GET') {
    const search = url.searchParams.get('search')?.trim() || ''
    if (search) assets = assets.filter((asset) => matchesSearch(asset, search))
    return json(queryPage(assets, url.searchParams, 40))
  }
  if (method === 'POST' || method === 'PUT') {
    const body = (await readJson(init)) as Record<string, unknown> | null
    if (!body || typeof body.title !== 'string' || typeof body.content !== 'string') {
      return json({ error: 'Enter a title and text content.' }, 400)
    }
    const id = method === 'PUT' ? String(body.id || '') : crypto.randomUUID()
    if (!id) return json({ error: 'A text asset ID is required.' }, 400)
    const current = assets.find((asset) => asset.id === id)
    if (method === 'PUT' && !current) return notFound('The text asset was not found.')
    const now = new Date().toISOString()
    const textAsset = {
      ...(current || {}),
      ...body,
      id,
      title: body.title.trim(),
      content: body.content.trim(),
      sizeBytes: new TextEncoder().encode(body.content.trim()).byteLength,
      source: body.source || 'manual',
      createdAt: current?.createdAt || now,
      updatedAt: now,
    }
    await putRecord('textAssets', textAsset)
    return json({ textAsset }, method === 'POST' ? 201 : 200)
  }
  if (method === 'DELETE') {
    const body = (await readJson(init)) as { id?: unknown } | null
    if (typeof body?.id !== 'string' || !body.id)
      return json({ error: 'A text asset ID is required.' }, 400)
    await deleteRecord('textAssets', body.id)
    return json({ deletedId: body.id })
  }
  return null
}

function publicMedia(record: StudioRecord, blob?: Blob | null) {
  const media: StudioRecord = {
    ...record,
    ...(typeof record.fileId === 'string' ? { storageKey: record.fileId } : {}),
  }
  if (blob) {
    media.url = createMediaObjectUrl(record, blob)
  }
  return media
}

async function assetsApi(url: URL, method: string, init?: RequestInit) {
  const route = url.pathname.match(/^\/api\/studio\/assets(?:\/save)?$/)
  if (!route) return null
  const isSave = url.pathname.endsWith('/save')
  let media: StudioRecord[] = await listRecords('media', { index: 'createdAt', direction: 'prev' })
  let textAssets: StudioRecord[] = await listRecords('textAssets', {
    index: 'updatedAt',
    direction: 'prev',
  })
  if (method === 'GET' && !isSave) {
    const type = url.searchParams.get('type') || 'all'
    const requestedIds = new Set(
      (url.searchParams.get('ids') || '')
        .split(',')
        .filter((id) => /^[A-Za-z0-9:_-]{1,160}$/.test(id))
        .slice(0, 100),
    )
    const search = url.searchParams.get('search')?.trim() || ''
    const sort = url.searchParams.get('sort') || 'date-desc'
    if (search) {
      media = media.filter((item) => matchesSearch(item, search))
      textAssets = textAssets.filter((item) => matchesSearch(item, search))
    }
    if (requestedIds.size) {
      media = media.filter((item) => requestedIds.has(item.id))
      textAssets = []
    }
    const mediaTypes = ['image', 'video', 'audio', 'document', 'other']
    if (mediaTypes.includes(type))
      media = media.filter((item) => String(item.mimeType || '').startsWith(`${type}/`))
    const textItems: StudioRecord[] = textAssets.map((item) => ({
      ...item,
      kind: 'text',
      filename: item.title || 'Text asset',
      alt: item.title || 'Text asset',
      mimeType: 'text/plain',
      filesize:
        Number(item.sizeBytes) || new TextEncoder().encode(String(item.content || '')).byteLength,
    }))
    const mediaItems: StudioRecord[] = await Promise.all(
      media.map(async (item) => {
        const file = typeof item.fileId === 'string' ? await getAssetFile(item.fileId) : null
        return publicMedia({ ...item, kind: 'media' }, file?.blob)
      }),
    )
    const all: StudioRecord[] =
      type === 'text' ? textItems : type === 'all' ? [...mediaItems, ...textItems] : mediaItems
    const descending = sort.startsWith('-') || sort.endsWith('desc')
    all.sort((left, right) => {
      const leftDate = String(left.createdAt || '')
      const rightDate = String(right.createdAt || '')
      const order = sort.includes('date')
        ? leftDate.localeCompare(rightDate)
        : String(left.filename || '').localeCompare(String(right.filename || ''))
      return descending ? -order : order
    })
    const page = queryPage(all, url.searchParams, 40)
    const counts = {
      all: media.length + textAssets.length,
      text: textAssets.length,
      image: media.filter((item) => String(item.mimeType || '').startsWith('image/')).length,
      video: media.filter((item) => String(item.mimeType || '').startsWith('video/')).length,
      audio: media.filter((item) => String(item.mimeType || '').startsWith('audio/')).length,
      document: media.filter((item) => String(item.mimeType || '').startsWith('application/'))
        .length,
      other: 0,
    }
    const estimate = await getStorageEstimate()
    return json({
      ...page,
      counts,
      quota: { usedBytes: estimate.usedBytes, limitBytes: estimate.quotaBytes },
    })
  }
  if (method === 'POST' && !isSave) {
    const form = init?.body instanceof FormData ? init.body : null
    const file = form?.get('file')
    if (!(file instanceof File)) return json({ error: 'Choose a file to upload.' }, 400)
    const now = new Date().toISOString()
    const record = {
      id: crypto.randomUUID(),
      filename: file.name,
      title: file.name,
      alt: String(form?.get('alt') || file.name),
      mimeType: file.type || 'application/octet-stream',
      filesize: file.size,
      source: String(form?.get('scope') || 'upload') === 'workflow' ? 'workflow' : 'upload',
      createdAt: now,
      updatedAt: now,
    }
    const saved = await saveMediaAsset(file, record)
    const publicRecord = publicMedia(saved, file)
    return json({ media: publicRecord, asset: publicRecord }, 201)
  }
  if (method === 'DELETE' && !isSave) {
    const body = (await readJson(init)) as { ids?: unknown } | null
    if (!Array.isArray(body?.ids)) return json({ error: 'Asset IDs are required.' }, 400)
    const assetIds = body.ids as string[]
    const removed = media.filter((item) => assetIds.includes(item.id))
    await deleteMediaAssets(removed)
    for (const item of removed) {
      const fileId = typeof item.fileId === 'string' ? item.fileId : ''
      const objectUrl = mediaUrlCache.get(fileId) || mediaUrlCache.get(item.id)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      mediaUrlCache.delete(item.id)
      if (fileId) mediaUrlCache.delete(fileId)
    }
    return json({ deletedIds: removed.map((item) => item.id) })
  }
  if (method === 'POST' && isSave) {
    const body = (await readJson(init)) as { assetId?: unknown } | null
    const asset = media.find((item) => item.id === body?.assetId)
    if (!asset) return notFound('The selected media is unavailable.')
    const next: StudioRecord = { ...asset, source: 'upload', updatedAt: new Date().toISOString() }
    await putRecord('media', next)
    const file = typeof next.fileId === 'string' ? await getAssetFile(next.fileId) : null
    return json({ media: publicMedia(next, file?.blob) })
  }
  return null
}

async function imageToolsApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/image-tools' || method !== 'POST') return null
  const input = (await readJson(init)) as Record<string, unknown> | null
  if (!input || typeof input.assetId !== 'string') {
    return json({ error: 'Choose a saved image and a supported tool.' }, 400)
  }
  const asset = await getRecord('media', input.assetId)
  if (!asset || !String(asset.mimeType || '').startsWith('image/')) {
    return json({ error: 'The selected image is unavailable.' }, 404)
  }
  const file = typeof asset.fileId === 'string' ? await getAssetFile(asset.fileId) : null
  if (!file?.blob) return json({ error: 'The selected image file is unavailable locally.' }, 404)

  const credentials = await readLocalProviderCredentials()
  const form = new FormData()
  form.set(
    'input',
    JSON.stringify({
      ...input,
      sourceName: asset.filename,
      sourceAlt: asset.alt,
      credentials: {
        keys: Object.fromEntries(
          Object.entries(credentials)
            .map(([key, value]) => [key, value?.apiKey])
            .filter(([, value]) => Boolean(value)),
        ),
        baseUrls: Object.fromEntries(
          Object.entries(credentials)
            .map(([key, value]) => [key, value?.baseUrl])
            .filter(([, value]) => Boolean(value)),
        ),
      },
    }),
  )
  form.set('source', file.blob, String(asset.filename || file.name || 'source-image'))
  const response = await networkFetch(new URL('/api/studio/image-tools', url.origin), {
    method: 'POST',
    body: form,
    signal: init?.signal,
  })
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!Array.isArray(result.outputs)) return json(result, response.status)
  const outputs = await Promise.all(
    result.outputs.map(async (output) => {
      if (!output || typeof output !== 'object') return output
      return persistMediaDocument(output as StudioRecord)
    }),
  )
  return json({ ...result, outputs }, response.status)
}

async function videoFramesApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/video-frames' || method !== 'POST') return null
  const form = init?.body instanceof FormData ? init.body : null
  const sourceVideoAssetId = String(form?.get('sourceVideoAssetId') || '')
  const captureMode = String(form?.get('captureMode') || '')
  const timestampSeconds = Number(form?.get('timestampSeconds'))
  const file = form?.get('file')
  if (
    !sourceVideoAssetId ||
    !['first', 'current', 'last'].includes(captureMode) ||
    !Number.isFinite(timestampSeconds) ||
    timestampSeconds < 0 ||
    !(file instanceof File)
  )
    return json({ error: 'Choose a valid video frame to save.' }, 400)

  const source = await getRecord('media', sourceVideoAssetId)
  if (!source || !String(source.mimeType || '').startsWith('video/')) {
    return json({ error: 'The source video is unavailable.' }, 404)
  }
  const now = new Date().toISOString()
  const filename = file.name || `video-frame-${captureMode}.png`
  const media = (await saveMediaAsset(file, {
    id: crypto.randomUUID(),
    filename,
    title: filename,
    alt: `${source.alt || source.filename || 'Video'} · ${captureMode} frame`,
    mimeType: file.type || 'image/png',
    source: 'derived',
    derivedFrom: source.id,
    derivedMetadata: {
      action: 'capture-frame',
      captureMode,
      timestampSeconds,
      sourceVideoAssetId: source.id,
    },
    createdAt: now,
    updatedAt: now,
  })) as StudioRecord
  const blob = await getAssetFile(String(media.fileId))
  if (blob?.blob) {
    media.storageKey = media.fileId
    media.url = createMediaObjectUrl(media, blob.blob)
  }
  return json({ media }, 201)
}

async function settingsApi(url: URL, method: string, init?: RequestInit) {
  if (url.pathname !== '/api/studio/settings') return null
  if (method === 'GET') {
    const settings = await readSettings()
    const estimate = await getStorageEstimate()
    return json({
      settings: publicSettings(settings),
      quota: { usedBytes: estimate.usedBytes, limitBytes: estimate.quotaBytes },
    })
  }
  if (method !== 'PUT') return null
  const body = (await readJson(init)) as Record<string, unknown> | null
  if (!body) return json({ error: 'Enter valid settings.' }, 400)
  if (typeof body.provider === 'string' && PROVIDERS.includes(body.provider as ProviderId)) {
    const provider = body.provider as ProviderId
    const next = await updateRecord<LocalSettings>('settings', 'current', (stored) => {
      const settings = (stored as LocalSettings | null) || defaultSettings
      const credentials = { ...settings.providerCredentials }
      const current = { ...(credentials[provider] || {}) }
      if (body.apiKey === null) delete current.apiKey
      else if (typeof body.apiKey === 'string' && body.apiKey.trim())
        current.apiKey = body.apiKey.trim()
      if (body.baseUrl === null) delete current.baseUrl
      else if (typeof body.baseUrl === 'string' && body.baseUrl.trim())
        current.baseUrl = body.baseUrl.trim()
      if (current.apiKey || current.baseUrl) credentials[provider] = current
      else delete credentials[provider]
      return {
        ...settings,
        id: 'current',
        providerCredentials: credentials,
        updatedAt: new Date().toISOString(),
      }
    })
    return json({ settings: publicSettings(next) })
  }

  const allowed = [
    'locale',
    'modelDefaults',
    'imagePreferences',
    'videoPreferences',
    'audioPreferences',
    'uiPreferences',
  ]
  const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)))
  if (body.locale !== undefined && body.locale !== 'en' && body.locale !== 'vi') {
    return json({ error: 'Choose English or Vietnamese.' }, 400)
  }
  const next = await updateRecord<LocalSettings>('settings', 'current', (stored) => {
    const settings = (stored as LocalSettings | null) || defaultSettings
    return {
      ...settings,
      ...updates,
      id: 'current',
      updatedAt: new Date().toISOString(),
    } as LocalSettings
  })
  return json({ settings: publicSettings(next) })
}

async function readJson(init?: RequestInit) {
  if (typeof init?.body !== 'string') return null
  try {
    return JSON.parse(init.body) as unknown
  } catch {
    return null
  }
}

/**
 * Fetch-compatible local data adapter. CRUD requests never leave the browser;
 * provider requests and route handlers without a local store remain network calls.
 */
export async function studioFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return networkFetch(input, init)
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
    window.location.origin,
  )
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  try {
    const localResponse =
      (await workflowSubrouteApi(url, method, init)) ||
      (await workflowsApi(url, method, init)) ||
      (await automationsApi(url, method, init)) ||
      (await productionsApi(url, method, init)) ||
      (await generationsApi(url, method, init)) ||
      (await promptsApi(url, method, init)) ||
      (await textAssetsApi(url, method, init)) ||
      (await assetsApi(url, method, init)) ||
      (await imageToolsApi(url, method, init)) ||
      (await videoFramesApi(url, method, init)) ||
      (await settingsApi(url, method, init))
    if (localResponse) return localResponse
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Local database operation failed.' },
      500,
    )
  }
  return networkFetch(input, init)
}

export async function readLocalProviderCredentials() {
  const settings = await readSettings()
  return settings.providerCredentials || {}
}

'use client'

import { DropdownSelect } from './DropdownSelect'
import { providersFor } from '@znith/contracts'
import type { ProviderInfo } from '@znith/contracts'
import Image from 'next/image'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CircleCheck,
  Clapperboard,
  Copy,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Save,
  Upload,
  Video,
  WandSparkles,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { studioFetch } from '@/lib/studio-local-api'
import {
  parsePromptJson,
  parseReferenceIds,
  normalizeProductionSheet,
  productionColumns,
  productionProjectInfo,
  productionRows,
  productionSheetNames,
  productionSourceHash,
  validateProductionSheets,
} from '@/lib/production-sheet'
import type {
  ProductionOutput,
  ProductionRecord,
  ProductionSheet,
  ProductionSheetName,
  ProductionSheets,
  ValidationIssue,
} from '@/lib/production-sheet'
import { useLocale } from '@/features/studio/shared/i18n/LocaleProvider'
import { Sidebar } from './AppChrome'

type Stage = 'master' | 'image' | 'motion'
type OutputAsset = {
  id: string
  url?: string
  filename?: string
  mimeType?: string
  filesize?: number
  alt?: string
}
type GenerationItem = {
  key: string
  itemId: string
  title: string
  prompt: string
  duration?: number
  aspectRatio?: string
  referenceIds?: string[]
  shotId?: string
  sourceImageKey?: string
}
type RunProgress = {
  stage: Stage
  completed: number
  total: number
  itemId: string
}
type ZipFile = { name: string; blob: Blob }
type TextPreview = {
  column: string
  rawValue: string
  displayValue: string
  isJson: boolean
}

const imageProviders = providersFor('image').filter((provider) => provider.models.image?.length)
const videoProviders = providersFor('video').filter((provider) => provider.models.video?.length)
const aspectRatios = ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9']

function textValue(record: Record<string, string>, name: string) {
  return String(record[name] || '').trim()
}

function formatCellValue(value: string, column: string) {
  const isJsonColumn = column.toLowerCase().includes('json')
  const looksLikeJson = /^(?:\{|\[)/.test(value.trim())
  if (!isJsonColumn && !looksLikeJson) return { value, isJson: false }

  try {
    return { value: JSON.stringify(JSON.parse(value), null, 2), isJson: true }
  } catch {
    return { value, isJson: isJsonColumn }
  }
}

function jsonCodeParts(line: string) {
  const tokenPattern =
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  const parts: { text: string; className?: string }[] = []
  let previousIndex = 0

  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > previousIndex) parts.push({ text: line.slice(previousIndex, index) })
    const isString = token.startsWith('"')
    const isKey =
      isString &&
      line
        .slice(index + token.length)
        .trimStart()
        .startsWith(':')
    parts.push({
      text: token,
      className: isKey ? 'text-sky-300' : isString ? 'text-emerald-300' : 'text-amber-300',
    })
    previousIndex = index + token.length
  }

  if (previousIndex < line.length) parts.push({ text: line.slice(previousIndex) })
  return parts
}

async function copyTextToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('Clipboard copy failed')
  }
}

function jsonRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function aspectRatioFrom(spec: Record<string, unknown>, fallback: string) {
  const output = jsonRecord(spec.output)
  const candidate = String(output.aspect_ratio || '')
  return aspectRatios.includes(candidate) ? candidate : fallback
}

function referenceIdsFromSpec(spec: Record<string, unknown>) {
  const references = jsonRecord(spec.references)
  return [
    ...new Set(
      Object.values(references).flatMap((value) =>
        Array.isArray(value)
          ? value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
          : typeof value === 'string'
            ? [value.trim()]
            : [],
      ),
    ),
  ].filter(Boolean)
}

function promptText(primary: string, spec: Record<string, unknown>, rawJson: string) {
  const prompt = primary || String(spec.prompt || '').trim()
  const negative = String(spec.negative_prompt || '').trim()
  if (prompt) return negative ? `${prompt}\n\nNegative constraints: ${negative}` : prompt
  return rawJson.trim()
}

function generationItems(production: ProductionRecord, stage: Stage): GenerationItem[] {
  if (stage === 'master') {
    return productionRows(production.sheets['Visual Bible']).map((row) => {
      const itemId = textValue(row, 'Id')
      const rawJson = textValue(row, 'Prompt Json')
      const spec = parsePromptJson(rawJson) || {}
      const prompt = promptText('', spec, rawJson)
      const title = textValue(row, 'Name/location') || itemId
      return {
        key: `master:${itemId}`,
        itemId,
        title,
        prompt: [
          `Create a production-ready visual reference sheet for ${title} (${textValue(row, 'Type')}).`,
          prompt,
        ]
          .filter(Boolean)
          .join('\n\n'),
        aspectRatio: aspectRatioFrom(spec, '1:1'),
      }
    })
  }

  if (stage === 'image') {
    return productionRows(production.sheets['Image Prompt']).map((row) => {
      const itemId = textValue(row, 'Prompt ID')
      const rawJson = textValue(row, 'Prompt Json')
      const spec = parsePromptJson(rawJson) || {}
      const refs = [
        ...new Set([
          ...parseReferenceIds(textValue(row, 'Reference ID')),
          ...referenceIdsFromSpec(spec),
        ]),
      ]
      return {
        key: `image:${itemId}`,
        itemId,
        title: itemId || textValue(row, 'Shot ID'),
        prompt: promptText(textValue(row, 'Image Prompt EN'), spec, rawJson),
        aspectRatio: aspectRatioFrom(spec, '16:9'),
        referenceIds: refs,
        shotId: textValue(row, 'Shot ID'),
      }
    })
  }

  const shotRows = productionRows(production.sheets['Shot Master'])
  const imageRows = productionRows(production.sheets['Image Prompt'])
  const shotsById = new Map(shotRows.map((row) => [textValue(row, 'Shot ID'), row]))
  const imagesById = new Map(imageRows.map((row) => [textValue(row, 'Prompt ID'), row]))
  const imagesByShot = new Map(imageRows.map((row) => [textValue(row, 'Shot ID'), row]))
  return productionRows(production.sheets['Motion Prompt']).map((row) => {
    const itemId = textValue(row, 'Animation ID')
    const shotId = textValue(row, 'Shot ID')
    const rawJson = textValue(row, 'Prompt Json')
    const spec = parsePromptJson(rawJson) || {}
    const shot = shotsById.get(shotId)
    const image = imagesById.get(textValue(shot || {}, 'Image ID')) || imagesByShot.get(shotId)
    const basePrompt = promptText(textValue(row, 'Motion Prompt EN'), spec, rawJson)
    const method = textValue(row, 'Motion Method')
    const jsonDuration = Number(spec.duration_seconds)
    const shotDuration = Number(textValue(shot || {}, 'Duration'))
    return {
      key: `motion:${itemId}`,
      itemId,
      title: itemId || shotId,
      prompt: [method ? `Motion method: ${method}` : '', basePrompt].filter(Boolean).join('\n\n'),
      duration:
        Number.isFinite(jsonDuration) && jsonDuration > 0
          ? jsonDuration
          : Number.isFinite(shotDuration) && shotDuration > 0
            ? shotDuration
            : undefined,
      aspectRatio: aspectRatioFrom(spec, '16:9'),
      shotId,
      sourceImageKey: image ? `image:${textValue(image, 'Prompt ID')}` : undefined,
    }
  })
}

function savedOutputFor(production: ProductionRecord, item: GenerationItem) {
  const output = production.outputs?.[item.key]
  return output?.status === 'succeeded' && output.sourceHash === production.sourceHash
}

function normalizeStoredProduction(production: ProductionRecord): ProductionRecord {
  const sourceSheets = production.sheets as unknown as Record<string, ProductionSheet | undefined>
  const legacyNames: Record<ProductionSheetName, string> = {
    'Visual Bible': '04 Visual Bible',
    'Shot Master': '05 Shot Master',
    'Image Prompt': '06 Image Prompts',
    'Motion Prompt': '07 Motion Prompts',
  }
  const sheets = Object.fromEntries(
    productionSheetNames.map((name) => {
      const source = sourceSheets[name] ||
        sourceSheets[legacyNames[name]] || { headers: [], rows: [] }
      return [name, normalizeProductionSheet(name, source)]
    }),
  ) as ProductionSheets
  return {
    ...production,
    sheets,
    sourceHash: productionSourceHash(sheets),
    validation: validateProductionSheets(sheets),
    outputs: production.outputs || {},
  }
}

function safePathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'production'
  )
}

function stageLabel(stage: Stage) {
  return stage === 'master' ? 'Visual Bible' : stage === 'image' ? 'Image Prompt' : 'Motion Prompt'
}

function stageFolder(stage: Stage) {
  return stage === 'master' ? 'master-assets' : stage === 'image' ? 'images' : 'motion'
}

function providerModels(provider: ProviderInfo | undefined, modality: 'image' | 'video') {
  return provider?.models[modality] || []
}

function selectProviderForModel(
  providers: ProviderInfo[],
  modality: 'image' | 'video',
  savedModel: string,
) {
  const match = providers.find((provider) => provider.models[modality]?.includes(savedModel))
  if (match) return { provider: match.id, model: savedModel }
  const first = providers[0]
  const model = first?.models[modality]?.[0]
  return first && model ? { provider: first.id, model } : null
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function createStoredZip(files: ZipFile[]) {
  const encoder = new TextEncoder()
  const localParts: BlobPart[] = []
  const centralParts: BlobPart[] = []
  let offset = 0
  let centralSize = 0

  for (const file of files) {
    const filename = encoder.encode(file.name.replace(/^\/+/, ''))
    const bytes = new Uint8Array(await file.blob.arrayBuffer())
    if (bytes.byteLength > 0xffffffff)
      throw new Error('An asset is too large to package in a ZIP file.')
    const checksum = crc32(bytes)

    const local = new Uint8Array(30 + filename.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, bytes.byteLength, true)
    localView.setUint32(22, bytes.byteLength, true)
    localView.setUint16(26, filename.length, true)
    local.set(filename, 30)
    localParts.push(local, bytes)

    const central = new Uint8Array(46 + filename.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, bytes.byteLength, true)
    centralView.setUint32(24, bytes.byteLength, true)
    centralView.setUint16(28, filename.length, true)
    centralView.setUint32(42, offset, true)
    central.set(filename, 46)
    centralParts.push(central)
    offset += local.byteLength + bytes.byteLength
    centralSize += central.byteLength
  }

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  return new Blob([...localParts, ...centralParts, end], {
    type: 'application/zip',
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function ProductionPage({ productionId }: { productionId: string }) {
  const { t } = useLocale()
  const [sourceUrl, setSourceUrl] = useState('')
  const [production, setProduction] = useState<ProductionRecord | null>(null)
  const [productionSaved, setProductionSaved] = useState(true)
  const [savingProduction, setSavingProduction] = useState(false)
  const productionRef = useRef<ProductionRecord | null>(null)
  const productionSavedRef = useRef(true)
  const [selectedSheet, setSelectedSheet] = useState<ProductionSheetName>('Shot Master')
  const [importing, setImporting] = useState(false)
  const [loadingProduction, setLoadingProduction] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [runningStage, setRunningStage] = useState<Stage | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [selectedStages, setSelectedStages] = useState<Record<Stage, boolean>>({
    master: true,
    image: true,
    motion: true,
  })
  const stopAfterCurrent = useRef(false)
  const fileInputs = useRef(new Map<string, HTMLInputElement>())
  const loadedAssetIds = useRef(new Set<string>())
  const [assetsById, setAssetsById] = useState<Record<string, OutputAsset>>({})
  const [preview, setPreview] = useState<OutputAsset | null>(null)
  const [textPreview, setTextPreview] = useState<TextPreview | null>(null)
  const [textCopied, setTextCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [imageProviderId, setImageProviderId] = useState<string>(imageProviders[0]?.id || '')
  const [imageModel, setImageModel] = useState<string>(imageProviders[0]?.models.image?.[0] || '')
  const [videoProviderId, setVideoProviderId] = useState<string>(videoProviders[0]?.id || '')
  const [videoModel, setVideoModel] = useState<string>(videoProviders[0]?.models.video?.[0] || '')

  const masterItems = useMemo(
    () => (production ? generationItems(production, 'master') : []),
    [production],
  )
  const imageItems = useMemo(
    () => (production ? generationItems(production, 'image') : []),
    [production],
  )
  const motionItems = useMemo(
    () => (production ? generationItems(production, 'motion') : []),
    [production],
  )
  const itemsByStage = useMemo(
    () => ({ master: masterItems, image: imageItems, motion: motionItems }),
    [imageItems, masterItems, motionItems],
  )
  const validationErrors =
    production?.validation.filter((issue) => issue.severity === 'error') || []
  const validationWarnings =
    production?.validation.filter((issue) => issue.severity === 'warning') || []
  const selectedData = production?.sheets[selectedSheet]
  const selectedRows = useMemo(() => productionRows(selectedData), [selectedData])
  const selectedColumns = productionColumns[selectedSheet]
  const selectedStage: Stage | null =
    selectedSheet === 'Visual Bible'
      ? 'master'
      : selectedSheet === 'Image Prompt'
        ? 'image'
        : selectedSheet === 'Motion Prompt'
          ? 'motion'
          : null
  const outputCount = production
    ? Object.values(production.outputs || {}).filter(
        (output) => output.status === 'succeeded' && output.sourceHash === production.sourceHash,
      ).length
    : 0

  useEffect(() => {
    let active = true
    productionRef.current = null
    productionSavedRef.current = true
    loadedAssetIds.current.clear()
    setAssetsById({})
    setProduction(null)
    setProductionSaved(true)
    setSourceUrl('')
    setLoadingProduction(true)
    setError('')
    void studioFetch(`/api/studio/productions?id=${encodeURIComponent(productionId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          production?: ProductionRecord
          error?: string
        }
        if (!response.ok || !body.production)
          throw new Error(body.error || 'Production project not found.')
        if (!active) return
        const normalized = normalizeStoredProduction(body.production)
        productionRef.current = normalized
        productionSavedRef.current = true
        setProductionSaved(true)
        setProduction(normalized)
        setSourceUrl(normalized.spreadsheetUrl)
        setSelectedSheet('Shot Master')
      })
      .catch((failure) => {
        if (active)
          setError(failure instanceof Error ? failure.message : 'Could not load production.')
      })
      .finally(() => active && setLoadingProduction(false))
    return () => {
      active = false
    }
  }, [productionId])

  useEffect(() => {
    let active = true
    void studioFetch('/api/studio/settings')
      .then((response) => response.json())
      .then((body: { settings?: { modelDefaults?: Record<string, unknown> } }) => {
        if (!active || !body.settings) return
        const image = selectProviderForModel(
          imageProviders,
          'image',
          String(body.settings.modelDefaults?.image || ''),
        )
        const video = selectProviderForModel(
          videoProviders,
          'video',
          String(body.settings.modelDefaults?.video || ''),
        )
        if (image) {
          setImageProviderId(image.provider)
          setImageModel(image.model)
        }
        if (video) {
          setVideoProviderId(video.provider)
          setVideoModel(video.model)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const saveProduction = useCallback(async (next: ProductionRecord) => {
    const response = await studioFetch('/api/studio/productions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    const body = (await response.json()) as {
      production?: ProductionRecord
      error?: string
    }
    if (!response.ok || !body.production)
      throw new Error(body.error || 'Could not save production data.')
    productionRef.current = body.production
    productionSavedRef.current = true
    setProductionSaved(true)
    setProduction(body.production)
    return body.production
  }, [])

  const saveCurrentProduction = async () => {
    const current = productionRef.current
    if (!current || savingProduction) return
    setSavingProduction(true)
    setError('')
    setFeedback('')
    try {
      await saveProduction({ ...current, updatedAt: new Date().toISOString() })
      setFeedback(t('production.savedFeedback'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save production data.')
    } finally {
      setSavingProduction(false)
    }
  }

  const importSheet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setImporting(true)
    setError('')
    setFeedback('')
    try {
      const response = await studioFetch('/api/studio/production-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl.trim() }),
      })
      const body = (await response.json()) as {
        spreadsheetId?: string
        sheets?: ProductionSheets
        error?: string
      }
      if (!response.ok || !body.spreadsheetId || !body.sheets) {
        throw new Error(body.error || 'Google Sheets could not be imported.')
      }
      const id = body.spreadsheetId
      if (id !== productionId) throw new Error(t('production.wrongSheet'))
      const old = productionRef.current
      const now = new Date().toISOString()
      const info = productionProjectInfo(body.sheets, id)
      const next: ProductionRecord = {
        id,
        spreadsheetUrl: sourceUrl.trim(),
        title: old?.id === id ? old.title : info.title,
        projectCode: old?.id === id ? old.projectCode : info.projectCode,
        sheets: body.sheets,
        sourceHash: productionSourceHash(body.sheets),
        validation: validateProductionSheets(body.sheets),
        outputs: old?.id === id ? old.outputs || {} : {},
        importedAt: now,
        createdAt: old?.id === id ? old.createdAt : now,
        updatedAt: now,
      }
      if (productionRef.current?.id !== id) {
        setAssetsById({})
        loadedAssetIds.current.clear()
      }
      productionRef.current = next
      productionSavedRef.current = false
      setProductionSaved(false)
      setProduction(next)
      setSelectedSheet('Shot Master')
      setFeedback(
        `${productionSheetNames.length} sheets · ${next.sheets['Shot Master'].rows.length} shots · ${next.validation.filter((issue) => issue.severity === 'error').length} validation errors`,
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Google Sheets could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  const loadAssets = useCallback(async (ids: string[]) => {
    const loaded: Record<string, OutputAsset> = {}
    for (let offset = 0; offset < ids.length; offset += 100) {
      const query = new URLSearchParams({
        ids: ids.slice(offset, offset + 100).join(','),
        limit: '100',
      })
      const response = await studioFetch(`/api/studio/assets?${query}`, {
        cache: 'no-store',
      })
      const body = (await response.json()) as { docs?: OutputAsset[] }
      for (const asset of body.docs || []) loaded[asset.id] = asset
    }
    return loaded
  }, [])

  useEffect(() => {
    const selectedId = production?.id
    const project = productionRef.current
    if (!selectedId || !project || project.id !== selectedId) return
    const ids = [
      ...new Set(
        Object.values(project.outputs || {})
          .filter((output) => output.status === 'succeeded' && output.assetId)
          .map((output) => output.assetId!),
      ),
    ]
    const missingIds = ids.filter((id) => !loadedAssetIds.current.has(id))
    if (!missingIds.length) return
    let active = true
    void loadAssets(missingIds)
      .then((loaded) => {
        if (!active) return
        Object.keys(loaded).forEach((id) => loadedAssetIds.current.add(id))
        setAssetsById((current) => ({ ...current, ...loaded }))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [loadAssets, production?.id, production?.outputs])

  const executeStage = async (
    stage: Stage,
    targets: GenerationItem[] = itemsByStage[stage],
    force = false,
    batch = false,
  ) => {
    let initial = productionRef.current
    if (!initial || runningStage || (batchRunning && !batch)) return false
    if (!productionSavedRef.current) {
      try {
        initial = await saveProduction(initial)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not save production data.')
        return false
      }
    }
    const provider = stage === 'motion' ? videoProviderId : imageProviderId
    const model = stage === 'motion' ? videoModel : imageModel
    if (!provider || !model) {
      setError(t('production.missingProvider'))
      return false
    }

    setError('')
    setFeedback('')
    setRunningStage(stage)
    if (!batch) stopAfterCurrent.current = false
    let completed = 0
    let generated = 0
    let skipped = 0
    let failed = false

    try {
      for (const item of targets) {
        const current = productionRef.current
        if (!current) break
        if (!force && savedOutputFor(current, item)) {
          completed += 1
          continue
        }
        if (stopAfterCurrent.current) break
        if (!item.itemId || !item.prompt.trim()) {
          skipped += 1
          if (targets.length === 1) {
            setError(`No usable prompt or ID is available for ${item.title || 'this row'}.`)
            failed = true
            break
          }
          continue
        }

        let referenceAssetIds: string[] = []
        if (stage === 'image') {
          referenceAssetIds = (item.referenceIds || [])
            .map((referenceId) => current.outputs?.[`master:${referenceId}`])
            .filter((output): output is ProductionOutput =>
              Boolean(
                output?.status === 'succeeded' &&
                output.sourceHash === current.sourceHash &&
                output.assetId,
              ),
            )
            .map((output) => output.assetId!)
        }
        if (stage === 'motion') {
          const imageOutput = item.sourceImageKey
            ? current.outputs?.[item.sourceImageKey]
            : undefined
          if (
            !imageOutput ||
            imageOutput.status !== 'succeeded' ||
            imageOutput.sourceHash !== current.sourceHash ||
            !imageOutput.assetId
          ) {
            skipped += 1
            if (targets.length === 1) {
              setError(
                `Generate or upload the source image for ${item.shotId || item.itemId} first.`,
              )
              failed = true
              break
            }
            continue
          }
          referenceAssetIds = [imageOutput.assetId]
          if (!item.duration || !Number.isFinite(item.duration) || item.duration <= 0) {
            skipped += 1
            if (targets.length === 1) {
              setError(
                `A valid Shot Master duration is required for ${item.shotId || item.itemId}.`,
              )
              failed = true
              break
            }
            continue
          }
        }

        setProgress({
          stage,
          completed,
          total: targets.length,
          itemId: item.itemId,
        })
        const extension = stage === 'motion' ? 'mp4' : 'png'
        const path = `productions/${safePathSegment(current.projectCode)}/${stageFolder(stage)}/${safePathSegment(item.itemId)}.${extension}`
        const outputMetadata = {
          filename: `${safePathSegment(item.itemId)}.${extension}`,
          outputPath: path,
          productionId: current.id,
          projectCode: current.projectCode,
          itemId: item.itemId,
          stage,
          title: `${item.title} · ${stageLabel(stage)}`,
          alt: item.title,
        }

        try {
          const response = await studioFetch('/api/studio/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modality: stage === 'motion' ? 'video' : 'image',
              provider,
              model,
              prompt: item.prompt,
              ...(stage === 'motion'
                ? {
                    duration: item.duration,
                    aspectRatio: item.aspectRatio || '16:9',
                  }
                : {
                    aspectRatio: item.aspectRatio || (stage === 'image' ? '16:9' : '1:1'),
                    quality: 'standard',
                  }),
              ...(referenceAssetIds.length ? { referenceAssetIds } : {}),
              outputMetadata,
            }),
          })
          const result = (await response.json()) as {
            generation?: {
              id?: string
              status?: string
              outputs?: Array<{ value?: OutputAsset }>
            }
            error?: string
          }
          const outputAsset = result.generation?.outputs?.find((output) => output.value)?.value
          if (!response.ok || result.generation?.status !== 'succeeded' || !outputAsset?.id) {
            throw new Error(result.error || `Generation failed for ${item.itemId}.`)
          }

          const now = new Date().toISOString()
          const savedOutput: ProductionOutput = {
            status: 'succeeded',
            assetId: outputAsset.id,
            generationId: result.generation.id,
            path,
            sourceHash: current.sourceHash,
            updatedAt: now,
          }
          const updated = await saveProduction({
            ...current,
            outputs: { ...current.outputs, [item.key]: savedOutput },
            updatedAt: now,
          })
          if (outputAsset.url) {
            loadedAssetIds.current.add(outputAsset.id)
            setAssetsById((existing) => ({
              ...existing,
              [outputAsset.id]: { ...outputAsset, url: outputAsset.url },
            }))
          }
          generated += 1
          completed += 1
          setProgress({
            stage,
            completed,
            total: targets.length,
            itemId: item.itemId,
          })
          productionRef.current = updated
        } catch (failure) {
          const message =
            failure instanceof Error ? failure.message : `Generation failed for ${item.itemId}.`
          const now = new Date().toISOString()
          await saveProduction({
            ...current,
            outputs: {
              ...current.outputs,
              [item.key]: {
                status: 'failed',
                path,
                sourceHash: current.sourceHash,
                error: message,
                updatedAt: now,
              },
            },
            updatedAt: now,
          })
          setError(t('production.failedAt', { item: item.itemId, error: message }))
          failed = true
          break
        }
      }

      if (!failed) {
        const skippedMessage = skipped
          ? ` · ${skipped} skipped (missing prompt, image or duration)`
          : ''
        setFeedback(
          stopAfterCurrent.current
            ? `${generated} ${stageLabel(stage)} generated${skippedMessage}. ${t('production.stop')}`
            : `${generated} ${stageLabel(stage)} generated${skippedMessage}.`,
        )
      }
    } finally {
      setRunningStage(null)
      setProgress(null)
      if (!batch) stopAfterCurrent.current = false
    }
    return !failed
  }

  const generateSelectedStages = async () => {
    if (!production || runningStage || batchRunning) return
    const stages = (['master', 'image', 'motion'] as const).filter((stage) => selectedStages[stage])
    if (!stages.length) {
      setError(t('production.selectAtLeastOne'))
      return
    }
    setError('')
    setFeedback('')
    setBatchRunning(true)
    stopAfterCurrent.current = false
    try {
      for (const stage of stages) {
        if (stopAfterCurrent.current) break
        const success = await executeStage(stage, itemsByStage[stage], false, true)
        if (!success) break
      }
    } finally {
      setBatchRunning(false)
      if (!stopAfterCurrent.current) stopAfterCurrent.current = false
    }
  }

  const uploadAsset = async (stage: Stage, item: GenerationItem, file: File) => {
    if (stage === 'motion' ? !file.type.startsWith('video/') : !file.type.startsWith('image/')) {
      setError(
        stage === 'motion'
          ? 'Upload a video file for a motion result.'
          : 'Upload an image file for this result.',
      )
      return
    }
    const current = productionRef.current
    if (!current) return
    const itemKey = item.key
    setUploadingItem(itemKey)
    setError('')
    setFeedback('')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('alt', item.title)
      form.set('scope', 'upload')
      const response = await studioFetch('/api/studio/assets', {
        method: 'POST',
        body: form,
      })
      const body = (await response.json()) as {
        media?: OutputAsset
        error?: string
      }
      if (!response.ok || !body.media?.id) throw new Error(body.error || 'Upload failed.')
      const folder = stageFolder(stage)
      const extension = /\.[A-Za-z0-9]{1,10}$/.exec(file.name)?.[0]?.toLowerCase()
      const filename = `${safePathSegment(item.itemId)}${extension || (stage === 'motion' ? '.mp4' : '.png')}`
      const path = `productions/${safePathSegment(current.projectCode)}/${folder}/${filename}`
      const now = new Date().toISOString()
      const updated = await saveProduction({
        ...current,
        outputs: {
          ...current.outputs,
          [itemKey]: {
            status: 'succeeded',
            assetId: body.media.id,
            path,
            sourceHash: current.sourceHash,
            updatedAt: now,
          },
        },
        updatedAt: now,
      })
      loadedAssetIds.current.add(body.media.id)
      setAssetsById((existing) => ({
        ...existing,
        [body.media!.id]: body.media!,
      }))
      productionRef.current = updated
      setFeedback(`Uploaded ${file.name} for ${item.title}.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Upload failed.')
    } finally {
      setUploadingItem(null)
    }
  }

  const outputItemsForSheet = (sheetName: ProductionSheetName) => {
    if (!production) return []
    if (sheetName === 'Visual Bible') return itemsByStage.master
    if (sheetName === 'Image Prompt') return itemsByStage.image
    if (sheetName === 'Motion Prompt') return itemsByStage.motion
    const shotIds = new Set(selectedRows.map((row) => textValue(row, 'Shot ID')))
    const shotImageIds = new Set(
      selectedRows.map((row) => textValue(row, 'Image ID')).filter(Boolean),
    )
    const imageItemsForShots = itemsByStage.image.filter(
      (item) => shotIds.has(item.shotId || '') || shotImageIds.has(item.itemId),
    )
    const motionItemsForShots = itemsByStage.motion.filter((item) => shotIds.has(item.shotId || ''))
    return [...imageItemsForShots, ...motionItemsForShots]
  }

  const downloadAllAssets = async (sheetName?: ProductionSheetName) => {
    const current = productionRef.current
    if (!current || downloading) return
    setDownloading(true)
    setError('')
    try {
      const items = sheetName
        ? outputItemsForSheet(sheetName)
        : [...masterItems, ...imageItems, ...motionItems]
      const outputs = items.flatMap((item) => {
        const output = current.outputs?.[item.key]
        return output?.status === 'succeeded' &&
          output.sourceHash === current.sourceHash &&
          output.assetId
          ? [{ item, output }]
          : []
      })
      if (!outputs.length)
        throw new Error('There are no current assets to download for this table.')
      const missingIds = outputs
        .map(({ output }) => output.assetId!)
        .filter((id) => !assetsById[id])
      const loaded = missingIds.length ? await loadAssets(missingIds) : {}
      if (Object.keys(loaded).length) {
        Object.keys(loaded).forEach((id) => loadedAssetIds.current.add(id))
        setAssetsById((existing) => ({ ...existing, ...loaded }))
      }
      const availableAssets = { ...assetsById, ...loaded }
      const files: ZipFile[] = []
      for (const { item, output } of outputs) {
        const asset = availableAssets[output.assetId!]
        if (!asset?.url) continue
        const response = await fetch(asset.url)
        if (!response.ok) continue
        const fallbackName = `${safePathSegment(item.itemId)}.${output.path.split('.').at(-1) || 'bin'}`
        const relativePath = output.path.replace(/^productions\/[^/]+\//, '')
        files.push({
          name: relativePath || fallbackName,
          blob: await response.blob(),
        })
      }
      if (!files.length)
        throw new Error('The saved media files could not be opened in this browser.')
      const zip = await createStoredZip(files)
      const tableSlug = sheetName
        ? `-${safePathSegment(sheetName.toLowerCase().replaceAll(' ', '-'))}`
        : ''
      downloadBlob(zip, `${safePathSegment(current.projectCode)}${tableSlug}-assets.zip`)
      setFeedback(`${files.length} assets packaged for download.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not package assets.')
    } finally {
      setDownloading(false)
    }
  }

  const currentRowItem = (row: Record<string, string>) => {
    if (selectedSheet === 'Visual Bible') {
      return itemsByStage.master.find((item) => item.itemId === textValue(row, 'Id'))
    }
    if (selectedSheet === 'Image Prompt') {
      return itemsByStage.image.find((item) => item.itemId === textValue(row, 'Prompt ID'))
    }
    if (selectedSheet === 'Motion Prompt') {
      return itemsByStage.motion.find((item) => item.itemId === textValue(row, 'Animation ID'))
    }
    return undefined
  }

  return (
    <div className="flex min-h-screen bg-white lg:h-screen lg:overflow-hidden">
      <Sidebar active="production" />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Link
            href="/production"
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-violet-700"
          >
            <ArrowLeft size={16} /> {t('production.backToManager')}
          </Link>
          <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
                <Clapperboard size={15} />
                Zenith Studio
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                {t('production.title')}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                {t('production.fixedTablesSubtitle')}
              </p>
            </div>
          </header>

          {production && (
            <section className="mb-6 rounded-2xl border border-zinc-200 bg-[#fbfbfc] p-4 sm:p-5">
              <form onSubmit={importSheet} className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-700">
                  {t('production.source')}
                  <input
                    type="url"
                    required
                    disabled={loadingProduction}
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={loadingProduction || importing || savingProduction}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#272441] px-4 text-sm font-semibold text-white transition hover:bg-[#37325e] disabled:cursor-wait disabled:opacity-60"
                  >
                    {importing ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    {importing
                      ? t('production.importing')
                      : production?.spreadsheetUrl === sourceUrl.trim()
                        ? t('production.refresh')
                        : t('production.import')}
                  </button>
                  {production && !productionSaved && (
                    <button
                      type="button"
                      onClick={() => void saveCurrentProduction()}
                      disabled={savingProduction || importing}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {savingProduction ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      {savingProduction ? t('production.saving') : t('production.save')}
                    </button>
                  )}
                </div>
              </form>
              <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{t('production.share')}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Check size={13} />
                  {t('production.local')}
                </span>
              </div>
            </section>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {feedback && !error && (
            <div
              role="status"
              className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              <CircleCheck size={17} className="shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {loadingProduction && !production ? (
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 p-8 text-sm text-zinc-500">
              <LoaderCircle size={17} className="animate-spin" />
              {t('common.loading')}
            </div>
          ) : !production ? (
            <section className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center">
              <FileSpreadsheet size={32} className="mx-auto text-zinc-300" />
              <h2 className="mt-3 text-base font-semibold text-zinc-800">
                {t('production.notFound')}
              </h2>
              <Link
                href="/production"
                className="mt-5 inline-flex rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
              >
                {t('production.backToManager')}
              </Link>
            </section>
          ) : (
            <>
              <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${validationErrors.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {validationErrors.length
                          ? `${validationErrors.length} ${t('production.errors')}`
                          : t('production.valid')}
                      </span>
                      {!productionSaved && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {t('production.unsaved')}
                        </span>
                      )}
                      {validationWarnings.length > 0 && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {validationWarnings.length} {t('production.warnings')}
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">
                        {t('production.importedAt')}{' '}
                        {new Date(production.importedAt).toLocaleString()}
                      </span>
                    </div>
                    <h2 className="mt-2 truncate text-lg font-semibold text-zinc-950">
                      {productionTitle(production)}
                    </h2>
                    <a
                      href={production.spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900"
                    >
                      {t('production.openSource')}
                    </a>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                      <span>
                        {selectedSheet === 'Shot Master'
                          ? selectedRows.length
                          : production.sheets['Shot Master'].rows.length}{' '}
                        {t('production.shots')}
                      </span>
                      <span>{production.sheets['Visual Bible'].rows.length} Visual Bible</span>
                      <span>{production.sheets['Image Prompt'].rows.length} Image Prompt</span>
                      <span>{production.sheets['Motion Prompt'].rows.length} Motion Prompt</span>
                      <span>
                        {outputCount} {t('production.outputsSaved')}
                      </span>
                    </div>
                  </div>

                  <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 xl:max-w-[720px]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {(['master', 'image', 'motion'] as const).map((stage) => (
                          <label
                            key={stage}
                            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700"
                          >
                            <input
                              type="checkbox"
                              checked={selectedStages[stage]}
                              onChange={(event) =>
                                setSelectedStages((current) => ({
                                  ...current,
                                  [stage]: event.target.checked,
                                }))
                              }
                              className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                            />
                            {stageLabel(stage)}
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadAllAssets()}
                          disabled={
                            downloading ||
                            outputCount === 0 ||
                            batchRunning ||
                            Boolean(runningStage)
                          }
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {downloading ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          {t('production.downloadAll')}
                        </button>
                        {batchRunning || runningStage ? (
                          <button
                            type="button"
                            onClick={() => {
                              stopAfterCurrent.current = true
                            }}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                          >
                            {t('production.stop')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void generateSelectedStages()}
                            disabled={
                              !masterItems.length && !imageItems.length && !motionItems.length
                            }
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                          >
                            <WandSparkles size={14} />
                            {t('production.generateSelected')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 border-t border-zinc-200 pt-3 sm:grid-cols-2">
                      <ProviderModelPicker
                        label={t('production.imageProvider')}
                        providers={imageProviders}
                        modality="image"
                        providerId={imageProviderId}
                        model={imageModel}
                        onProviderChange={(provider) => {
                          setImageProviderId(provider)
                          setImageModel(
                            imageProviders.find((item) => item.id === provider)?.models
                              .image?.[0] || '',
                          )
                        }}
                        onModelChange={setImageModel}
                      />
                      <ProviderModelPicker
                        label={t('production.videoProvider')}
                        providers={videoProviders}
                        modality="video"
                        providerId={videoProviderId}
                        model={videoModel}
                        onProviderChange={(provider) => {
                          setVideoProviderId(provider)
                          setVideoModel(
                            videoProviders.find((item) => item.id === provider)?.models
                              .video?.[0] || '',
                          )
                        }}
                        onModelChange={setVideoModel}
                      />
                    </div>
                  </div>
                </div>

                {progress && (
                  <div className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle size={14} className="animate-spin" />
                        {stageLabel(progress.stage)} · {progress.itemId}
                      </span>
                      <span>
                        {progress.completed}/{progress.total}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
                      <div
                        className="h-full rounded-full bg-violet-600 transition-all"
                        style={{
                          width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {(validationErrors.length > 0 || validationWarnings.length > 0) && (
                  <details className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                      {t('production.validationDetails')}
                    </summary>
                    <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                      {[...validationErrors, ...validationWarnings]
                        .slice(0, 100)
                        .map((issue, index) => (
                          <ValidationRow
                            key={`${issue.sheet}-${issue.row}-${index}`}
                            issue={issue}
                          />
                        ))}
                    </div>
                  </details>
                )}
              </section>

              <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {t('production.fixedTablesTitle')}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">{t('production.fixedTablesHelp')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedStage && (
                      <button
                        type="button"
                        onClick={() => void executeStage(selectedStage)}
                        disabled={
                          Boolean(runningStage) ||
                          batchRunning ||
                          !itemsByStage[selectedStage].length
                        }
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                      >
                        {runningStage === selectedStage ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <WandSparkles size={14} />
                        )}
                        {t('production.generateTable')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void downloadAllAssets(selectedSheet)}
                      disabled={downloading || batchRunning || Boolean(runningStage)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {downloading ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {t('production.downloadTable')}
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-3 pt-2">
                  {productionSheetNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedSheet(name)}
                      className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold transition ${selectedSheet === name ? 'border border-b-white border-zinc-200 bg-white text-violet-700' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {selectedRows.length ? (
                  <div className="overflow-auto">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                        <tr>
                          {selectedColumns.map((column) => (
                            <th
                              key={column}
                              className="border-b border-zinc-200 px-3 py-3 font-semibold"
                            >
                              {column}
                            </th>
                          ))}
                          {selectedStage && (
                            <th className="border-b border-zinc-200 px-3 py-3 font-semibold">
                              {t('production.action')}
                            </th>
                          )}
                          {selectedStage && (
                            <th className="border-b border-zinc-200 px-3 py-3 font-semibold">
                              {t('production.result')}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {selectedRows.map((row, rowIndex) => {
                          const item = currentRowItem(row)
                          const stage = selectedStage
                          const output = production.outputs?.[item?.key || '']
                          const asset = output?.assetId ? assetsById[output.assetId] : undefined
                          const isStale =
                            output?.status === 'succeeded' &&
                            output.sourceHash !== production.sourceHash
                          const busy = Boolean(runningStage || batchRunning)
                          return (
                            <tr
                              key={`${textValue(row, 'Shot ID') || textValue(row, 'Id') || textValue(row, 'Prompt ID') || textValue(row, 'Animation ID')}-${rowIndex}`}
                              className="align-top hover:bg-zinc-50/70"
                            >
                              {selectedColumns.map((column) => {
                                const value = textValue(row, column)
                                const formatted = formatCellValue(value, column)
                                const canExpand = formatted.isJson || formatted.value.length > 140

                                return (
                                  <td
                                    key={column}
                                    className="max-w-[320px] min-w-[140px] px-3 py-3 text-zinc-700"
                                  >
                                    {!value ? (
                                      <span className="text-zinc-300">—</span>
                                    ) : canExpand ? (
                                      <button
                                        type="button"
                                        title={t('production.viewFullText')}
                                        onClick={() => {
                                          setTextCopied(false)
                                          setCopyError('')
                                          setTextPreview({
                                            column,
                                            rawValue: value,
                                            displayValue: formatted.value,
                                            isJson: formatted.isJson,
                                          })
                                        }}
                                        className={`block max-h-[4.5rem] w-full cursor-zoom-in overflow-hidden text-left line-clamp-3 break-words whitespace-pre-wrap hover:text-violet-700 ${formatted.isJson ? 'font-mono text-[11px] leading-5' : ''}`}
                                      >
                                        {formatted.value}
                                      </button>
                                    ) : (
                                      <span className="block whitespace-pre-wrap break-words">
                                        {formatted.value}
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                              {stage && (
                                <td className="min-w-[140px] px-3 py-2.5">
                                  {item && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        title={t('production.generateRow')}
                                        aria-label={`${t('production.generateRow')} ${item.title}`}
                                        disabled={busy || uploadingItem === item.key}
                                        onClick={() => void executeStage(stage, [item], true)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                                      >
                                        {runningStage === stage &&
                                        progress?.itemId === item.itemId ? (
                                          <LoaderCircle size={15} className="animate-spin" />
                                        ) : (
                                          <WandSparkles size={15} />
                                        )}
                                      </button>
                                      <input
                                        ref={(element) => {
                                          if (element) fileInputs.current.set(item.key, element)
                                          else fileInputs.current.delete(item.key)
                                        }}
                                        className="sr-only"
                                        type="file"
                                        accept={stage === 'motion' ? 'video/*' : 'image/*'}
                                        onChange={(event) => {
                                          const file = event.target.files?.[0]
                                          if (file) void uploadAsset(stage, item, file)
                                          event.target.value = ''
                                        }}
                                      />
                                      <button
                                        type="button"
                                        title={t('production.uploadRow')}
                                        aria-label={`${t('production.uploadRow')} ${item.title}`}
                                        disabled={busy || uploadingItem === item.key}
                                        onClick={() => fileInputs.current.get(item.key)?.click()}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                                      >
                                        {uploadingItem === item.key ? (
                                          <LoaderCircle size={15} className="animate-spin" />
                                        ) : (
                                          <Upload size={15} />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        title={t('production.downloadRow')}
                                        aria-label={`${t('production.downloadRow')} ${item.title}`}
                                        disabled={!asset?.url}
                                        onClick={() => {
                                          if (!asset?.url) return
                                          const anchor = document.createElement('a')
                                          anchor.href = asset.url
                                          anchor.download =
                                            asset.filename ||
                                            output?.path.split('/').at(-1) ||
                                            `${item.itemId}.bin`
                                          anchor.click()
                                        }}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 disabled:opacity-30"
                                      >
                                        <ArrowDownToLine size={15} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )}
                              {stage && (
                                <td className="min-w-[160px] px-3 py-2.5">
                                  {asset?.url ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreview(asset)}
                                      className="group relative block h-20 w-32 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 text-left"
                                    >
                                      {asset.mimeType?.startsWith('video/') ? (
                                        <video
                                          src={asset.url}
                                          className="h-full w-full object-cover"
                                          muted
                                          preload="metadata"
                                        />
                                      ) : (
                                        <Image
                                          src={asset.url}
                                          alt={asset.alt || item?.title || ''}
                                          width={320}
                                          height={200}
                                          unoptimized
                                          className="h-full w-full object-cover"
                                        />
                                      )}
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                                        {asset.mimeType?.startsWith('video/') ? (
                                          <Video size={20} />
                                        ) : (
                                          <ImageIcon size={20} />
                                        )}
                                      </span>
                                      {isStale && (
                                        <span className="absolute bottom-1 left-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                                          {t('production.stale')}
                                        </span>
                                      )}
                                    </button>
                                  ) : output?.status === 'failed' ? (
                                    <span className="text-rose-700" title={output.error}>
                                      {t('production.failed')}
                                    </span>
                                  ) : output?.status === 'succeeded' ? (
                                    <span className="text-zinc-400">
                                      {t('production.loadingResult')}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-300">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-12 text-center text-sm text-zinc-500">
                    {t('production.noRows')}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {textPreview && (
        <div
          role="presentation"
          onClick={() => setTextPreview(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={textPreview.column}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-zinc-900">
                  {textPreview.column}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {textPreview.isJson ? 'JSON' : t('production.fullText')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCopyError('')
                    void copyTextToClipboard(textPreview.rawValue)
                      .then(() => {
                        setTextCopied(true)
                        window.setTimeout(() => setTextCopied(false), 1800)
                      })
                      .catch(() => setCopyError(t('production.copyFailed')))
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
                >
                  {textCopied ? <Check size={15} /> : <Copy size={15} />}
                  {textCopied
                    ? t('production.copied')
                    : /prompt|json/i.test(textPreview.column)
                      ? t('production.copyPrompt')
                      : t('production.copyText')}
                </button>
                <button
                  type="button"
                  onClick={() => setTextPreview(null)}
                  className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label={t('Close')}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className="min-h-0 overflow-auto p-4 sm:p-5">
              {textPreview.isJson ? (
                <div className="overflow-auto rounded-xl border border-zinc-800 bg-[#0d1117] p-4 text-[12px] leading-6 text-zinc-100 shadow-inner">
                  <pre className="w-full whitespace-pre-wrap break-words font-mono">
                    <code className="block min-w-0">
                      {textPreview.displayValue.split('\n').map((line, lineIndex) => (
                        <span
                          key={lineIndex}
                          className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)]"
                        >
                          <span className="select-none pr-4 text-right text-zinc-600">
                            {lineIndex + 1}
                          </span>
                          <span className="min-w-0 break-words">
                            {jsonCodeParts(line).map((part, partIndex) => (
                              <span key={partIndex} className={part.className}>
                                {part.text}
                              </span>
                            ))}
                          </span>
                        </span>
                      ))}
                    </code>
                  </pre>
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">
                  {textPreview.displayValue}
                </div>
              )}
              {copyError && <p className="mt-3 text-xs text-rose-600">{copyError}</p>}
            </div>
          </section>
        </div>
      )}

      {preview?.url && (
        <div
          role="presentation"
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={preview.filename || t('production.result')}
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[92vh] max-w-[96vw] flex-col overflow-hidden rounded-xl bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-white">
              <span className="truncate">
                {preview.filename || preview.alt || t('production.result')}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={preview.url}
                  download={preview.filename || 'production-asset'}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
                  title={t('production.downloadRow')}
                >
                  <Download size={17} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
                  aria-label={t('Close')}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {preview.mimeType?.startsWith('video/') ? (
              <video
                src={preview.url}
                controls
                autoPlay
                className="max-h-[82vh] max-w-[96vw] object-contain"
              />
            ) : (
              <Image
                src={preview.url}
                alt={preview.alt || preview.filename || ''}
                width={1920}
                height={1080}
                unoptimized
                className="max-h-[82vh] max-w-[96vw] object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function productionTitle(production: ProductionRecord) {
  return production.title || production.projectCode || 'Production project'
}

function ProviderModelPicker({
  label,
  providers,
  modality,
  providerId,
  model,
  onProviderChange,
  onModelChange,
}: {
  label: string
  providers: ProviderInfo[]
  modality: 'image' | 'video'
  providerId: string
  model: string
  onProviderChange: (value: string) => void
  onModelChange: (value: string) => void
}) {
  const provider = providers.find((item) => item.id === providerId)
  const models = providerModels(provider, modality)
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
        <DropdownSelect
          value={providerId}
          onChange={(event) => onProviderChange(event.target.value)}
          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium normal-case tracking-normal text-zinc-800 outline-none focus:border-violet-400"
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </DropdownSelect>
      </label>
      <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Model
        <DropdownSelect
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium normal-case tracking-normal text-zinc-800 outline-none focus:border-violet-400"
        >
          {models.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </DropdownSelect>
      </label>
    </div>
  )
}

function ValidationRow({ issue }: { issue: ValidationIssue }) {
  const warning = issue.severity === 'warning'
  return (
    <div
      className={`flex items-start gap-2 text-xs ${warning ? 'text-amber-800' : 'text-rose-700'}`}
    >
      {warning ? (
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
      ) : (
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
      )}
      <span>
        {issue.sheet && (
          <strong>
            {issue.sheet}
            {issue.row ? ` row ${issue.row}` : ''}:{' '}
          </strong>
        )}
        {issue.message}
      </span>
    </div>
  )
}

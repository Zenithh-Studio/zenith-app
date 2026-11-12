'use client'

import { studioFetch } from '@/lib/studio-local-api'

import Image from 'next/image'
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react'
import {
  Brush,
  Check,
  Compass,
  Crop,
  LoaderCircle,
  Scissors,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react'
import { useLocale } from '../../../shared/i18n/LocaleProvider'

export type ImageToolAction =
  | 'capture-frame'
  | 'crop'
  | 'split'
  | 'upscale'
  | 'super-resolution'
  | 'mask-edit'
  | 'describe'
  | 'variation'
  | 'angle'
export type DerivedImageAsset = {
  id: string
  url?: string | null
  storageKey?: string
  filename?: string | null
  mimeType?: string | null
  alt: string
  derivedMetadata?: Record<string, unknown>
}

type CropRegion = { x: number; y: number; width: number; height: number }

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function ImageUtilitiesDialog({
  assetId,
  assetName,
  imageURL,
  initialAction = 'crop',
  onClose,
  onCreated,
  onInsertText,
}: {
  assetId: string
  assetName: string
  imageURL: string
  initialAction?: ImageToolAction
  onClose: () => void
  onCreated: (action: ImageToolAction, assets: DerivedImageAsset[]) => void
  onInsertText: (content: string, sourceAssetId: string) => void
}) {
  const { t } = useLocale()
  const [action, setAction] = useState<ImageToolAction>(initialAction)
  const [crop, setCrop] = useState<CropRegion | null>(null)
  const [columns, setColumns] = useState(2)
  const [rows, setRows] = useState(2)
  const [scale, setScale] = useState<2 | 4>(2)
  const [faceEnhance, setFaceEnhance] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [imageRatio, setImageRatio] = useState(4 / 3)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [maskDataUrl, setMaskDataUrl] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionSaved, setDescriptionSaved] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [direction, setDirection] = useState<'front' | 'left' | 'right' | 'back' | 'high' | 'low'>(
    'left',
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startPoint = useRef<{ x: number; y: number } | null>(null)

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }
  const beginCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (action !== 'crop') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = pointFromEvent(event)
    startPoint.current = start
    setCrop({ x: start.x, y: start.y, width: 0, height: 0 })
  }
  const moveCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (action !== 'crop' || !startPoint.current) return
    const point = pointFromEvent(event)
    const start = startPoint.current
    setCrop({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }
  const endCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!startPoint.current) return
    moveCrop(event)
    startPoint.current = null
  }

  const paintMask = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (!context) return
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
    if (event.type === 'pointerdown') {
      canvas.setPointerCapture(event.pointerId)
      startPoint.current = point
      context.beginPath()
      context.moveTo(point.x, point.y)
      context.strokeStyle = 'rgb(244, 63, 94)'
      context.lineWidth = Math.max(24, Math.min(canvas.width, canvas.height) * 0.045)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineTo(point.x + 0.01, point.y + 0.01)
      context.stroke()
      context.beginPath()
      context.moveTo(point.x, point.y)
      return
    }
    if (event.type === 'pointermove' && startPoint.current) {
      context.lineTo(point.x, point.y)
      context.stroke()
      context.beginPath()
      context.moveTo(point.x, point.y)
    }
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      startPoint.current = null
      setMaskDataUrl(canvas.toDataURL('image/png'))
    }
  }

  const clearMask = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setMaskDataUrl('')
  }

  const buildMaskForRequest = () => {
    const visibleMask = canvasRef.current
    if (!visibleMask || !imageSize.width || !imageSize.height || !maskDataUrl) return ''
    const mask = document.createElement('canvas')
    mask.width = imageSize.width
    mask.height = imageSize.height
    const context = mask.getContext('2d')
    if (!context) return ''
    context.fillStyle = '#fff'
    context.fillRect(0, 0, mask.width, mask.height)
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(visibleMask, 0, 0, mask.width, mask.height)
    return mask.toDataURL('image/png')
  }

  const apply = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body =
        action === 'describe'
          ? { action, assetId }
          : action === 'crop'
            ? { action, assetId, crop }
            : action === 'split'
              ? { action, assetId, columns, rows }
              : action === 'upscale' || action === 'super-resolution'
                ? { action, assetId, scale: action === 'super-resolution' ? 4 : scale, faceEnhance }
                : action === 'mask-edit'
                  ? { action, assetId, prompt, mask: buildMaskForRequest() }
                  : action === 'angle'
                    ? { action, assetId, direction, prompt }
                    : { action, assetId, prompt }
      const response = await studioFetch('/api/studio/image-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json()) as {
        outputs?: DerivedImageAsset[]
        description?: string
        error?: string
      }
      if (!response.ok) {
        throw new Error(result.error || 'The image tool could not be completed.')
      }
      if (action === 'describe') {
        if (!result.description) throw new Error('The image description was empty.')
        setDescription(result.description)
        setDescriptionSaved(false)
        setMessage(t('Review the draft below, then add it to the canvas or Assets.'))
        return
      }
      if (!result.outputs?.length) {
        throw new Error(result.error || 'The derived image could not be created.')
      }
      onCreated(action, result.outputs)
      setMessage(
        result.outputs.length === 1
          ? t('Derived image saved to Assets and added to the canvas.')
          : t('{count} image parts saved to Assets and added to the canvas in reading order.', {
              count: result.outputs.length,
            }),
      )
      if (action === 'crop') setCrop(null)
    } catch (failure) {
      setError(
        t(failure instanceof Error ? failure.message : 'The derived image could not be created.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const actions: Array<{ id: ImageToolAction; label: string; Icon: typeof Crop }> = [
    { id: 'crop', label: t('Crop'), Icon: Crop },
    { id: 'split', label: t('Split'), Icon: Scissors },
    { id: 'upscale', label: t('Upscale'), Icon: ZoomIn },
    { id: 'super-resolution', label: t('Super-resolution'), Icon: Sparkles },
    { id: 'mask-edit', label: t('Mask edit'), Icon: Brush },
    { id: 'describe', label: t('Describe image'), Icon: Sparkles },
    { id: 'variation', label: t('Variation'), Icon: Sparkles },
    { id: 'angle', label: t('Angle'), Icon: Compass },
  ]
  const applyDisabled =
    busy ||
    (action === 'crop' && !(crop && crop.width > 0 && crop.height > 0)) ||
    (action === 'mask-edit' && (!maskDataUrl || !prompt.trim())) ||
    (action === 'variation' && !prompt.trim())

  return (
    <div
      className="fixed inset-0 z-[140] grid place-items-center bg-zinc-950/50 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('Image tools')}
        className="flex max-h-[min(92vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">{t('Image tools')}</h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {t('Original stays in Assets · {assetName}', { assetName })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('Close image tools')}
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-600"
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_280px] lg:overflow-hidden">
          <div className="flex min-h-[260px] items-center justify-center bg-zinc-950 p-4 sm:min-h-[380px] sm:p-6 lg:min-h-0">
            <div
              className="relative max-h-[55vh] w-full max-w-2xl touch-none overflow-hidden rounded-lg bg-zinc-900"
              style={{ aspectRatio: imageRatio }}
              onPointerDown={beginCrop}
              onPointerMove={moveCrop}
              onPointerUp={endCrop}
              onPointerCancel={endCrop}
              aria-label={t(
                action === 'crop' ? 'Draw the crop area over the image' : 'Image preview',
              )}
              role={action === 'crop' ? 'application' : undefined}
            >
              <Image
                src={imageURL}
                alt={assetName}
                fill
                sizes="(max-width: 1024px) 100vw, 65vw"
                unoptimized
                draggable={false}
                onLoad={(event: SyntheticEvent<HTMLImageElement>) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setImageRatio(naturalWidth / naturalHeight)
                    setImageSize({ width: naturalWidth, height: naturalHeight })
                  }
                }}
                className="pointer-events-none select-none object-contain"
              />
              {action === 'mask-edit' && imageSize.width > 0 && imageSize.height > 0 ? (
                <canvas
                  ref={canvasRef}
                  width={imageSize.width}
                  height={imageSize.height}
                  aria-label={t('Paint the areas to edit')}
                  onPointerDown={paintMask}
                  onPointerMove={paintMask}
                  onPointerUp={paintMask}
                  onPointerCancel={paintMask}
                  className="absolute inset-0 size-full touch-none opacity-60"
                />
              ) : null}
              {action === 'crop' && crop && crop.width > 0 && crop.height > 0 && (
                <div
                  className="pointer-events-none absolute border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,.5)]"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />
              )}
              {action === 'split' && (
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: columns * rows }, (_, index) => (
                    <span
                      key={index}
                      className="border border-white/80 bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)]"
                      style={{
                        gridColumn: `${(index % columns) + 1}`,
                        gridRow: `${Math.floor(index / columns) + 1}`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col border-t border-zinc-100 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-1 border-b border-zinc-100 p-2">
              {actions.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={action === id}
                  onClick={() => {
                    setAction(id)
                    setError('')
                    setMessage('')
                  }}
                  className={`flex h-9 items-center justify-center gap-2 rounded-lg text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600 ${action === id ? 'bg-violet-50 text-violet-800' : 'text-zinc-500 hover:bg-zinc-50'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-4 p-4">
              {action === 'crop' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t(
                      'Drag across the preview to mark a crop. The result will be a new PNG asset.',
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCrop(null)}
                    disabled={!crop || busy}
                    className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {t('Clear selection')}
                  </button>
                </>
              )}
              {action === 'mask-edit' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t(
                      'Paint over the image areas that OpenAI should change. The unpainted area is protected.',
                    )}
                  </p>
                  <label className="block text-[11px] font-medium text-zinc-600">
                    {t('Describe the edit')}
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      rows={4}
                      maxLength={32_000}
                      placeholder={t('Describe what should appear in the painted area…')}
                      className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 p-2.5 text-xs leading-5 outline-none focus:border-violet-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={clearMask}
                    disabled={!maskDataUrl || busy}
                    className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {t('Clear mask')}
                  </button>
                  <p className="text-[10px] text-zinc-400">
                    {t('OpenAI GPT Image 2.5 edit · uses your saved OpenAI key.')}
                  </p>
                </>
              )}
              {action === 'describe' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t('Create a text draft from the image, then review it before reuse.')}
                  </p>
                  {description ? (
                    <>
                      <label className="block text-[11px] font-medium text-zinc-600">
                        {t('Review description')}
                        <textarea
                          value={description}
                          onChange={(event) => {
                            setDescription(event.target.value)
                            setDescriptionSaved(false)
                          }}
                          rows={7}
                          className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 p-2.5 text-xs leading-5 outline-none focus:border-violet-400"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!description.trim()}
                          onClick={() => {
                            onInsertText(description.trim(), assetId)
                            setMessage(t('Description added as a text node.'))
                          }}
                          className="h-9 rounded-lg bg-zinc-900 px-2 text-[10px] font-medium text-white disabled:opacity-40"
                        >
                          {t('Add text node')}
                        </button>
                        <button
                          type="button"
                          disabled={!description.trim() || descriptionSaved}
                          onClick={async () => {
                            try {
                              const response = await studioFetch('/api/studio/text-assets', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  title: `${assetName} · image description`,
                                  content: description.trim(),
                                  source: 'studio',
                                  sourceId: assetId,
                                  metadata: {
                                    provider: 'openai',
                                    model: 'gpt-6-luna',
                                    sourceAssetId: assetId,
                                    action: 'describe-image',
                                  },
                                }),
                              })
                              const result = (await response.json()) as { error?: string }
                              if (!response.ok)
                                throw new Error(result.error || 'Text asset could not be saved.')
                              setDescriptionSaved(true)
                              setMessage(t('Description saved to Assets.'))
                            } catch (failure) {
                              setError(
                                t(
                                  failure instanceof Error
                                    ? failure.message
                                    : 'Text asset could not be saved.',
                                ),
                              )
                            }
                          }}
                          className="h-9 rounded-lg border border-zinc-200 px-2 text-[10px] font-medium text-zinc-700 disabled:opacity-40"
                        >
                          {descriptionSaved ? t('Saved to Assets') : t('Save to Assets')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[10px] leading-4 text-zinc-500">
                      {t('The description will appear here for review.')}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-400">
                    {t('Uses your saved OpenAI key with the GPT-6 Luna vision model.')}
                  </p>
                </>
              )}
              {action === 'variation' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t('Create a new image variation while keeping the main subject recognizable.')}
                  </p>
                  <label className="block text-[11px] font-medium text-zinc-600">
                    {t('Variation direction')}
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      rows={4}
                      maxLength={4_000}
                      placeholder={t('Describe the changes you want…')}
                      className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 p-2.5 text-xs leading-5 outline-none focus:border-violet-400"
                    />
                  </label>
                </>
              )}
              {action === 'angle' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t(
                      'Generate another camera angle while preserving the subject style and identity.',
                    )}
                  </p>
                  <label className="block text-[11px] font-medium text-zinc-600">
                    {t('Camera angle')}
                    <select
                      value={direction}
                      onChange={(event) => setDirection(event.target.value as typeof direction)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                    >
                      {(['front', 'left', 'right', 'back', 'high', 'low'] as const).map((angle) => (
                        <option key={angle} value={angle}>
                          {t(angle)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-zinc-600">
                    {t('Additional direction (optional)')}
                    <input
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      maxLength={4_000}
                      className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                    />
                  </label>
                </>
              )}
              {action === 'split' && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {t('Preview tiles are saved as separate derived assets in reading order.')}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-medium text-zinc-600">
                      {t('Columns')}
                      <select
                        value={columns}
                        onChange={(event) => setColumns(Number(event.target.value))}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        {[2, 3, 4].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-zinc-600">
                      {t('Rows')}
                      <select
                        value={rows}
                        onChange={(event) => setRows(Number(event.target.value))}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        {[2, 3, 4].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-[10px] text-zinc-400">{t('Maximum 4 × 4 tiles per split.')}</p>
                </>
              )}
              {(action === 'upscale' || action === 'super-resolution') && (
                <>
                  <p className="text-xs leading-5 text-zinc-600">
                    {action === 'super-resolution'
                      ? t(
                          'Run Real-ESRGAN at 4×. This creates a new derived asset; your original remains unchanged.',
                        )
                      : t(
                          'Resize the image locally with Lanczos3. This creates a new derived asset; your original remains unchanged.',
                        )}
                  </p>
                  {action === 'upscale' && (
                    <label className="block text-[11px] font-medium text-zinc-600">
                      {t('Scale')}
                      <select
                        value={scale}
                        onChange={(event) => setScale(Number(event.target.value) as 2 | 4)}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value={2}>2×</option>
                        <option value={4}>4×</option>
                      </select>
                    </label>
                  )}
                  {action === 'super-resolution' && (
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-600">
                      <input
                        type="checkbox"
                        checked={faceEnhance}
                        onChange={(event) => setFaceEnhance(event.target.checked)}
                        className="accent-violet-600"
                      />
                      {t('Face enhancement')}
                    </label>
                  )}
                  {action === 'super-resolution' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                      {t(
                        'Provider usage may be billed to the Replicate account connected in Settings.',
                      )}
                    </p>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="text-xs leading-5 text-rose-700">
                  {error}
                </p>
              )}
              {message && (
                <p
                  role="status"
                  className="flex items-start gap-1.5 text-xs leading-5 text-emerald-700"
                >
                  <Check size={14} className="mt-0.5 shrink-0" /> {message}
                </p>
              )}
            </div>

            <footer className="border-t border-zinc-100 p-3">
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applyDisabled}
                title={
                  action === 'describe'
                    ? t('Describe the image and return a draft for review.')
                    : action === 'super-resolution'
                      ? t(
                          'Create and save a derived image using the configured Replicate provider.',
                        )
                      : ['mask-edit', 'variation', 'angle'].includes(action)
                        ? t('Create and save an image using your configured OpenAI provider.')
                        : t('Create and save a derived image.')
                }
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                {busy
                  ? t(action === 'describe' ? 'Describing image' : 'Processing image')
                  : action === 'describe'
                    ? t('Describe image')
                    : action === 'split'
                      ? t('Create {count} parts', { count: columns * rows })
                      : action === 'mask-edit'
                        ? t('Apply mask edit')
                        : action === 'variation'
                          ? t('Create variation')
                          : action === 'angle'
                            ? t('Generate angle')
                            : t('Create derived image')}
              </button>
            </footer>
          </aside>
        </div>
      </section>
    </div>
  )
}

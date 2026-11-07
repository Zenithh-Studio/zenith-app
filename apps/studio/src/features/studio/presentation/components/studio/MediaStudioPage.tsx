'use client'

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  Check,
  CircleAlert,
  Clock3,
  Download,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Search,
  Sparkles,
  Video,
  X,
} from 'lucide-react'
import {
  defaultModelDuration,
  displayModelName,
  modelDurationOptions,
  modelResolutionOptions,
  providersFor,
} from '@znith/contracts'
import { Sidebar } from './AppChrome'
import {
  formatLocaleBytes,
  formatLocaleDate,
  useLocale,
} from '@/features/studio/shared/i18n/LocaleProvider'

type Modality = 'image' | 'video'
type StudioAsset = {
  id: string
  url?: string | null
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  alt: string
  createdAt: string
}
type StudioGeneration = {
  id: string
  modality: Modality | 'audio'
  status: string
  prompt?: string
  provider: string
  model: string
  inputSnapshot?: { node?: { config?: Record<string, unknown> }; referenceAssetIds?: string[] }
  outputs?: unknown[]
  providerTaskId?: string | null
  lastPolledAt?: string | null
  error?: string | null
  errorCode?: string | null
  createdAt: string
  durationMs?: number | null
}
type StudioPreferences = {
  provider: string
  model: string
  aspectRatio: string
  quality: string
  duration: number
  resolution: string
}

function assetUrl(asset: StudioAsset) {
  return (
    asset.url || (asset.filename ? `/api/media/file/${encodeURIComponent(asset.filename)}` : '')
  )
}

function firstOutput(generation?: StudioGeneration): StudioAsset | undefined {
  for (const item of generation?.outputs ?? []) {
    if (!item || typeof item !== 'object') continue
    const relation = item as { relationTo?: string; value?: unknown }
    const value = (
      relation.value && typeof relation.value === 'object' ? relation.value : item
    ) as Partial<StudioAsset>
    if (
      typeof value.id === 'string' &&
      (value.mimeType?.startsWith('image/') || value.mimeType?.startsWith('video/'))
    ) {
      return value as StudioAsset
    }
  }
  return undefined
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/40 p-3 backdrop-blur-sm sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
          >
            <X size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function MediaStudioPage({
  modality,
  initialPreferences,
  isAdmin,
}: {
  modality: Modality
  initialPreferences: StudioPreferences
  isAdmin: boolean
}) {
  const { locale, t } = useLocale()
  const searchParams = useSearchParams()
  const title = t(modality === 'image' ? 'Image Studio' : 'Video Studio')
  const visibleProviders = useMemo(
    () =>
      providersFor(modality).filter(
        (provider) =>
          Boolean(provider.models[modality]?.length) &&
          (isAdmin || !['chatgpt2api', 'muse2api'].includes(provider.id)),
      ),
    [isAdmin, modality],
  )
  const [provider, setProvider] = useState(() =>
    visibleProviders.some((item) => item.id === initialPreferences.provider)
      ? initialPreferences.provider
      : visibleProviders[0]?.id || '',
  )
  const [model, setModel] = useState(() =>
    visibleProviders
      .find((item) => item.id === initialPreferences.provider)
      ?.models[modality]?.includes(initialPreferences.model)
      ? initialPreferences.model
      : visibleProviders[0]?.models[modality]?.[0] || '',
  )
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState(initialPreferences.aspectRatio)
  const [quality, setQuality] = useState(initialPreferences.quality)
  const [duration, setDuration] = useState(initialPreferences.duration)
  const [resolution, setResolution] = useState(initialPreferences.resolution)
  const [referenceAssets, setReferenceAssets] = useState<StudioAsset[]>([])
  const [history, setHistory] = useState<StudioGeneration[]>([])
  const [selected, setSelected] = useState<StudioGeneration>()
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [error, setError] = useState('')
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [promptPickerOpen, setPromptPickerOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [assetSearch, setAssetSearch] = useState('')
  const [prompts, setPrompts] = useState<Array<{ id: string; title: string; content: string }>>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const loadedPromptId = useRef('')
  const currentProvider =
    visibleProviders.find((item) => item.id === provider) || visibleProviders[0]
  const models = currentProvider?.models[modality] || []
  const durationOptions = modelDurationOptions(provider, model)
  const resolutionOptions = modelResolutionOptions(provider, model)
  const supportsVideoReference =
    modality === 'video' && provider === 'replicate' && model === 'bytedance/seedance-2.5'
  const selectedAsset = firstOutput(selected)
  const selectedUrl = selectedAsset ? assetUrl(selectedAsset) : ''

  const checkSelectedStatus = async (generation = selected) => {
    if (!generation?.providerTaskId || checkingStatus) return
    setCheckingStatus(true)
    setError('')
    try {
      const response = await fetch(
        `/api/studio/generations/${encodeURIComponent(generation.id)}/status`,
        { method: 'POST' },
      )
      const body = (await response.json()) as { generation?: StudioGeneration; error?: string }
      if (!response.ok || !body.generation)
        throw new Error(t(body.error || 'Could not check provider task status.'))
      setHistory((current) =>
        current.map((item) => (item.id === body.generation!.id ? body.generation! : item)),
      )
      setSelected((current) => (current?.id === body.generation!.id ? body.generation! : current))
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t('Could not check provider task status.'),
      )
    } finally {
      setCheckingStatus(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetch(`/api/studio/generations?modality=${modality}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as { generations?: StudioGeneration[]; error?: string }
        if (!response.ok) throw new Error(t(body.error || 'Could not load generation history.'))
        if (!active) return
        setHistory(body.generations || [])
        setSelected(body.generations?.[0])
        const resumable = body.generations?.find(
          (item) =>
            item.modality === 'video' &&
            item.providerTaskId &&
            ['running', 'pending', 'interrupted'].includes(item.status),
        )
        if (resumable) {
          void fetch(`/api/studio/generations/${encodeURIComponent(resumable.id)}/status`, {
            method: 'POST',
          })
            .then(async (statusResponse) => {
              const statusBody = (await statusResponse.json()) as { generation?: StudioGeneration }
              if (!active || !statusResponse.ok || !statusBody.generation) return
              setHistory((current) =>
                current.map((item) =>
                  item.id === statusBody.generation!.id ? statusBody.generation! : item,
                ),
              )
              setSelected((current) =>
                current?.id === statusBody.generation!.id ? statusBody.generation! : current,
              )
            })
            .catch(() => undefined)
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : t('Could not load generation history.'),
          )
      })
      .finally(() => active && setLoadingHistory(false))
    return () => {
      active = false
    }
  }, [modality, t])

  useEffect(() => {
    const promptId = searchParams.get('prompt')
    if (!promptId || loadedPromptId.current === promptId) return
    loadedPromptId.current = promptId
    let active = true
    void fetch(`/api/studio/prompts?id=${encodeURIComponent(promptId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as { prompt?: { content?: string }; error?: string }
        if (!response.ok || !body.prompt?.content)
          throw new Error(t(body.error || 'Saved prompt could not be loaded.'))
        if (active) setPrompt(body.prompt.content)
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : t('Saved prompt could not be loaded.'),
          )
      })
    return () => {
      active = false
    }
  }, [searchParams, t])

  useEffect(() => {
    const search = assetSearch.trim()
    if (!assetPickerOpen) return
    const timeout = window.setTimeout(() => {
      const types = supportsVideoReference ? ['image', 'video'] : ['image']
      void Promise.all(
        types.map(async (type) => {
          const query = new URLSearchParams({ type, limit: '40' })
          if (search) query.set('search', search)
          const response = await fetch(`/api/studio/assets?${query}`, { cache: 'no-store' })
          const body = (await response.json()) as { docs?: StudioAsset[] }
          if (!response.ok) throw new Error('Could not load reference assets.')
          return body.docs || []
        }),
      )
        .then((groups) => setAssets(groups.flat()))
        .catch((failure) =>
          setError(
            t(failure instanceof Error ? failure.message : 'Could not load reference assets.'),
          ),
        )
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [assetPickerOpen, assetSearch, supportsVideoReference, t])

  const uploadReferenceFiles = async (files: File[]) => {
    const reference = files.find(
      (file) =>
        file.type.startsWith('image/') ||
        (supportsVideoReference && file.type.startsWith('video/')),
    )
    if (!reference) return
    if (reference.size > 5 * 1024 * 1024) {
      setError(t('Seedance references must be 5 MB or smaller.'))
      return
    }
    setError('')
    const form = new FormData()
    form.set('file', reference)
    form.set('alt', reference.name)
    try {
      const response = await fetch('/api/studio/assets', { method: 'POST', body: form })
      const body = (await response.json()) as { media?: StudioAsset; error?: string }
      if (!response.ok || !body.media)
        throw new Error(t(body.error || 'Could not upload reference image.'))
      setReferenceAssets((current) => {
        if (body.media!.mimeType?.startsWith('video/')) return [body.media!]
        return [
          ...current.filter(
            (item) => !item.mimeType?.startsWith('video/') && item.id !== body.media!.id,
          ),
          body.media!,
        ]
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not upload reference image.'))
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file && file.type.startsWith('image/')))
    if (files.length) void uploadReferenceFiles(files)
  }

  const openPromptPicker = async () => {
    try {
      const response = await fetch('/api/studio/prompts', { cache: 'no-store' })
      const body = (await response.json()) as {
        docs?: Array<{ id: string; title: string; content: string }>
      }
      if (!response.ok) throw new Error('Could not load saved prompts.')
      setPrompts(body.docs || [])
      setPromptPickerOpen(true)
    } catch (failure) {
      setError(t(failure instanceof Error ? failure.message : 'Could not load saved prompts.'))
    }
  }

  const requestBody = () => ({
    modality,
    provider,
    model,
    prompt,
    aspectRatio,
    ...(modality === 'image' ? { quality } : { duration, resolution }),
    referenceAssetIds: referenceAssets.map((asset) => asset.id),
  })

  const generate = async (event?: FormEvent<HTMLFormElement>, retryOf?: string) => {
    event?.preventDefault()
    if (generating || (!retryOf && !prompt.trim())) return
    setGenerating(true)
    setError('')
    try {
      const response = await fetch('/api/studio/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryOf ? { retryOf } : requestBody()),
      })
      const body = (await response.json()) as {
        generation?: StudioGeneration
        error?: string
        warning?: string
      }
      if (!body.generation) throw new Error(t(body.error || 'Generation could not start.'))
      setHistory((current) => [
        body.generation!,
        ...current.filter((item) => item.id !== body.generation!.id),
      ])
      setSelected(body.generation)
      if (body.error || body.warning) setError(t(body.error || body.warning || ''))
      if (!response.ok && !body.generation) throw new Error(body.error || 'Generation failed.')
    } catch (failure) {
      setError(
        failure instanceof Error
          ? t(failure.message)
          : t('Generation failed. Your prompt and settings are still available.'),
      )
    } finally {
      setGenerating(false)
    }
  }

  const useOutputAsReference = () => {
    if (!selectedAsset) return
    if (selectedAsset.mimeType?.startsWith('video/')) {
      if (!supportsVideoReference) return
      setReferenceAssets([selectedAsset])
    } else {
      setReferenceAssets((current) => [
        ...current.filter(
          (item) => !item.mimeType?.startsWith('video/') && item.id !== selectedAsset.id,
        ),
        selectedAsset,
      ])
    }
    setError('')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8] lg:flex-row">
      <Sidebar active={modality} />
      <main className="min-w-0 flex-1 px-4 pb-12 pt-5 sm:px-7 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#746d9d]">
                {t('Personal generation workspace')}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                {t(
                  modality === 'image'
                    ? 'Create images with your provider settings. Every generation is saved to your private history and Assets.'
                    : 'Create videos with your provider settings. Every generation is saved to your private history and Assets.',
                )}
              </p>
            </div>
            <a
              href="/settings"
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              {t('Provider settings')}
            </a>
          </header>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs leading-5 text-rose-700"
            >
              <CircleAlert size={15} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <button type="button" aria-label={t('Dismiss error')} onClick={() => setError('')}>
                <X size={14} />
              </button>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <form onSubmit={(event) => void generate(event)} className="space-y-5 p-4 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-zinc-600">
                    {t('Provider')}
                    <select
                      value={provider}
                      onChange={(event) => {
                        const next = visibleProviders.find((item) => item.id === event.target.value)
                        setProvider(event.target.value)
                        setModel(next?.models[modality]?.[0] || '')
                      }}
                      className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-800 outline-none focus:border-violet-400"
                    >
                      {visibleProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-zinc-600">
                    {t('Model')}
                    <select
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-800 outline-none focus:border-violet-400"
                    >
                      {models.map((item) => (
                        <option key={item} value={item}>
                          {displayModelName(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-semibold text-zinc-600">
                  {t('Prompt')}
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onPaste={handlePaste}
                    rows={7}
                    placeholder={
                      modality === 'image'
                        ? t('Describe the image you want to create…')
                        : t('Describe the motion, subject, and atmosphere…')
                    }
                    className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-sm font-normal leading-6 text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-50"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-zinc-600">
                    {t('Aspect ratio')}
                    <select
                      value={aspectRatio}
                      onChange={(event) => setAspectRatio(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs font-normal text-zinc-700"
                    >
                      {['1:1', '16:9', '9:16', '4:3', '3:2', '2:3', '3:4', '21:9'].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  {modality === 'image' ? (
                    <label className="text-xs font-semibold text-zinc-600">
                      {t('Quality')}
                      <select
                        value={quality}
                        onChange={(event) => setQuality(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs font-normal text-zinc-700"
                      >
                        {['draft', 'standard', 'high'].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="text-xs font-semibold text-zinc-600">
                      {t('Duration')}
                      <select
                        value={duration}
                        onChange={(event) => setDuration(Number(event.target.value))}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs font-normal text-zinc-700"
                      >
                        {(durationOptions.length
                          ? durationOptions
                          : [defaultModelDuration(provider, model)]
                        ).map((item) => (
                          <option key={item} value={item}>
                            {t('{count} seconds', { count: item })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {modality === 'video' ? (
                    <label className="text-xs font-semibold text-zinc-600">
                      {t('Resolution')}
                      <select
                        value={resolution}
                        disabled={!resolutionOptions.length}
                        onChange={(event) => setResolution(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs font-normal text-zinc-700 disabled:bg-zinc-50 disabled:text-zinc-400"
                      >
                        {(resolutionOptions.length ? resolutionOptions : ['720p']).map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xs font-semibold text-zinc-700">
                        {t(supportsVideoReference ? 'Reference media' : 'Reference images')}
                      </h2>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {supportsVideoReference
                          ? t('Choose image references or one video reference. Do not mix the two.')
                          : t('Upload, paste, or choose an image from your Assets.')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAssetPickerOpen(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        <Search size={12} /> {t('Assets')}
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        <ImagePlus size={13} /> {t('Upload')}
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept={supportsVideoReference ? 'image/*,video/*' : 'image/*'}
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          if (files.length) void uploadReferenceFiles(files)
                          event.target.value = ''
                        }}
                      />
                    </div>
                  </div>
                  {referenceAssets.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {referenceAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="relative grid size-[72px] place-items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
                        >
                          {asset.mimeType?.startsWith('video/') ? (
                            <Video size={20} className="text-zinc-500" />
                          ) : (
                            <Image
                              src={assetUrl(asset)}
                              alt={asset.alt || asset.filename || t('Reference image')}
                              fill
                              sizes="72px"
                              unoptimized
                              className="object-cover"
                            />
                          )}
                          <button
                            type="button"
                            aria-label={t('Remove {name}', {
                              name: asset.filename || t('reference'),
                            })}
                            title={t('Remove reference')}
                            onClick={() =>
                              setReferenceAssets((current) =>
                                current.filter((item) => item.id !== asset.id),
                              )
                            }
                            className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/95 text-zinc-700 shadow"
                          >
                            <X size={12} />
                          </button>
                          <span className="absolute bottom-0 inset-x-0 truncate bg-black/60 px-1 text-[9px] text-white">
                            {asset.filename}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="submit"
                    disabled={generating || !prompt.trim() || !models.length}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#292644] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#403a6d] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {generating ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {generating
                      ? t('Generating…')
                      : t(modality === 'image' ? 'Generate image' : 'Generate video')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openPromptPicker()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    <FileImage size={14} /> {t('Prompt Library')}
                  </button>
                  <span className="ml-auto text-[11px] text-zinc-400">
                    {t('Provider keys stay encrypted in Settings.')}
                  </span>
                </div>
              </form>

              <div className="border-t border-zinc-100 bg-[#fbfbfc] p-4 sm:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{t('Result')}</h2>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {selected
                        ? `${selected.provider} · ${displayModelName(selected.model)}`
                        : t('Generated media appears here.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${selected.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' : ['running', 'pending', 'queued'].includes(selected.status) ? 'bg-violet-50 text-violet-700' : selected.status === 'interrupted' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}
                      >
                        {t(selected.status)}
                      </span>
                    )}
                    {selectedUrl && (
                      <button
                        type="button"
                        aria-label={t('Expand preview')}
                        title={t('Expand preview')}
                        onClick={() => setPreviewOpen(true)}
                        className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                      >
                        <Maximize2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {selectedUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950">
                    {modality === 'image' ? (
                      <div className="relative aspect-[4/3] w-full bg-zinc-100">
                        <Image
                          src={selectedUrl}
                          alt={selected?.prompt || t('Generated image')}
                          fill
                          sizes="(max-width: 1280px) 100vw, 900px"
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <video
                        src={selectedUrl}
                        controls
                        playsInline
                        className="max-h-[65vh] w-full bg-black object-contain"
                      />
                    )}
                  </div>
                ) : (
                  <div className="grid min-h-[300px] place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
                    {['running', 'pending', 'queued'].includes(selected?.status || '') ? (
                      <LoaderCircle size={26} className="animate-spin text-violet-500" />
                    ) : modality === 'image' ? (
                      <FileImage size={30} className="text-zinc-300" />
                    ) : (
                      <Video size={30} className="text-zinc-300" />
                    )}
                    <p className="mt-3 max-w-md text-xs leading-5 text-zinc-500">
                      {selected?.error ||
                        selected?.errorCode ||
                        t('Your next result will be saved to Assets and appear in this history.')}
                    </p>
                  </div>
                )}
                {!selectedUrl && selected && (
                  <div className="mt-3 flex justify-end gap-2">
                    {selected.providerTaskId &&
                      ['running', 'pending', 'interrupted'].includes(selected.status) && (
                        <button
                          type="button"
                          disabled={checkingStatus || generating}
                          onClick={() => void checkSelectedStatus()}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-45"
                        >
                          {checkingStatus && <LoaderCircle size={13} className="animate-spin" />}
                          {t('Check status')}
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={
                        generating ||
                        checkingStatus ||
                        ['running', 'pending', 'queued', 'interrupted'].includes(selected.status)
                      }
                      onClick={() => void generate(undefined, selected.id)}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-45"
                    >
                      {t('Retry with saved settings')}
                    </button>
                  </div>
                )}
                {selectedUrl && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={selectedUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      <Download size={14} /> {t('Download original')}
                    </a>
                    {(modality === 'image' || supportsVideoReference) && (
                      <button
                        type="button"
                        onClick={useOutputAsReference}
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        {t('Use as reference')}
                      </button>
                    )}
                    {selected && (
                      <button
                        type="button"
                        disabled={
                          generating ||
                          checkingStatus ||
                          ['running', 'pending', 'queued', 'interrupted'].includes(selected.status)
                        }
                        onClick={() => void generate(undefined, selected.id)}
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-45"
                      >
                        {t('Retry with saved settings')}
                      </button>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Check size={13} /> {t('Saved to Assets')}
                    </span>
                  </div>
                )}
                {selected?.error && selected.status === 'succeeded' && (
                  <p className="mt-2 text-xs text-amber-700">{selected.error}</p>
                )}
              </div>
            </section>

            <aside className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">{t('History')}</h2>
                  <p className="mt-1 text-[11px] text-zinc-500">{t('Private to your account')}</p>
                </div>
                <Clock3 size={16} className="text-zinc-400" />
              </header>
              <div className="max-h-[calc(100vh-250px)] min-h-48 space-y-2 overflow-y-auto p-3">
                {loadingHistory ? (
                  <div className="flex items-center gap-2 px-2 py-6 text-xs text-zinc-500">
                    <LoaderCircle size={14} className="animate-spin" /> {t('Loading history')}
                  </div>
                ) : !history.length ? (
                  <div className="px-2 py-8 text-center text-xs leading-5 text-zinc-500">
                    {t('Your generations will stay here when you leave this page.')}
                  </div>
                ) : (
                  history.map((generation) => {
                    const media = firstOutput(generation)
                    return (
                      <button
                        type="button"
                        key={generation.id}
                        onClick={() => {
                          setSelected(generation)
                          if (generation.prompt) setPrompt(generation.prompt)
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ${selected?.id === generation.id ? 'border-violet-300 bg-violet-50/50' : 'border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50'}`}
                      >
                        <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-400">
                          {media ? (
                            media.mimeType?.startsWith('video/') ? (
                              <Video size={18} />
                            ) : (
                              <Image
                                src={assetUrl(media)}
                                alt=""
                                fill
                                sizes="56px"
                                unoptimized
                                className="object-cover"
                              />
                            )
                          ) : generation.status === 'running' ? (
                            <LoaderCircle size={16} className="animate-spin" />
                          ) : modality === 'image' ? (
                            <FileImage size={18} />
                          ) : (
                            <Video size={18} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-zinc-800">
                            {generation.prompt || t('Untitled generation')}
                          </span>
                          <span className="mt-1 block truncate text-[10px] text-zinc-500">
                            {generation.provider} · {displayModelName(generation.model)}
                          </span>
                          <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span className="capitalize">{t(generation.status)}</span>
                            <span>·</span>
                            <time>{formatLocaleDate(generation.createdAt, locale)}</time>
                          </span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      {assetPickerOpen && (
        <Modal
          title={t(supportsVideoReference ? 'Choose a reference asset' : 'Choose an image asset')}
          onClose={() => setAssetPickerOpen(false)}
        >
          <div className="relative border-b border-zinc-100 p-3">
            <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder={
                supportsVideoReference
                  ? t('Search image and video Assets…')
                  : t('Search image Assets…')
              }
              className="h-10 w-full rounded-lg border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-violet-400"
            />
          </div>
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                onClick={() => {
                  setReferenceAssets((current) =>
                    asset.mimeType?.startsWith('video/')
                      ? [asset]
                      : [
                          ...current.filter(
                            (item) => !item.mimeType?.startsWith('video/') && item.id !== asset.id,
                          ),
                          asset,
                        ],
                  )
                  setAssetPickerOpen(false)
                }}
                className="overflow-hidden rounded-xl border border-zinc-200 text-left hover:border-violet-300"
              >
                <span className="relative grid aspect-square place-items-center bg-zinc-100">
                  {asset.mimeType?.startsWith('video/') ? (
                    <Video size={22} className="text-zinc-500" />
                  ) : (
                    assetUrl(asset) && (
                      <Image
                        src={assetUrl(asset)}
                        alt={asset.alt || asset.filename || t('Asset')}
                        fill
                        sizes="220px"
                        unoptimized
                        className="object-cover"
                      />
                    )
                  )}
                </span>
                <span className="block truncate px-2.5 py-2 text-[11px] font-medium text-zinc-700">
                  {asset.filename || asset.alt}
                </span>
                <span className="block px-2.5 pb-2 text-[10px] text-zinc-400">
                  {asset.mimeType?.startsWith('video/') ? `${t('Video')} · ` : `${t('Image')} · `}
                  {formatLocaleBytes(asset.filesize || 0, locale)}
                </span>
              </button>
            ))}
          </div>
          {!assets.length && (
            <p className="p-8 text-center text-xs text-zinc-500">
              {t('No matching reference assets.')}
            </p>
          )}
        </Modal>
      )}

      {promptPickerOpen && (
        <Modal title={t('Insert from Prompt Library')} onClose={() => setPromptPickerOpen(false)}>
          <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">
            {prompts.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setPrompt(item.content)
                  setPromptPickerOpen(false)
                }}
                className="w-full rounded-xl border border-zinc-200 p-3 text-left hover:border-violet-300 hover:bg-violet-50/40"
              >
                <span className="block text-xs font-semibold text-zinc-800">{item.title}</span>
                <span className="mt-1 block line-clamp-2 whitespace-pre-wrap text-[11px] leading-5 text-zinc-500">
                  {item.content}
                </span>
              </button>
            ))}
            {!prompts.length && (
              <p className="py-10 text-center text-xs text-zinc-500">
                {t('Save a reusable prompt in the Prompt Library first.')}
              </p>
            )}
          </div>
        </Modal>
      )}

      {previewOpen && selectedUrl && (
        <Modal title={t('{title} preview', { title })} onClose={() => setPreviewOpen(false)}>
          {modality === 'image' ? (
            <div className="relative h-[70vh] w-full bg-zinc-950">
              <Image
                src={selectedUrl}
                alt={selected?.prompt || t('Generated image')}
                fill
                sizes="100vw"
                unoptimized
                className="object-contain"
              />
            </div>
          ) : (
            <video
              src={selectedUrl}
              controls
              autoPlay={false}
              className="max-h-[75vh] w-full bg-black"
            />
          )}
        </Modal>
      )}
    </div>
  )
}

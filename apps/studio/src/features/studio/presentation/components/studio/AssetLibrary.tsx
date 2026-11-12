'use client'

import { studioFetch } from '@/lib/studio-local-api'

import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Copy,
  FileAudio,
  FileText,
  FileVideo,
  Grid2X2,
  Image as ImageIcon,
  LayoutGrid,
  List,
  LoaderCircle,
  Pencil,
  Search,
  X,
  Trash2,
  Upload,
  Save,
} from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetDocument } from '@znith/contracts'
import { formatLocaleBytes, formatLocaleDate, useLocale } from '../../../shared/i18n/LocaleProvider'
import { Sidebar } from './AppChrome'
import { toggleAssetSelection } from './asset-library-utils'
import type { AssetSort } from './asset-library-utils'

type AssetView = 'list' | 'icon' | 'medium-icon'
type MenuName = 'sort' | 'view' | null
type AssetTypeFilter = 'all' | 'image' | 'video' | 'audio' | 'document' | 'text' | 'other'

type AssetCounts = Record<AssetTypeFilter, number>
type AssetQuota = { usedBytes: number; limitBytes: number }
type TextLibraryAsset = AssetDocument & {
  kind: 'text'
  title: string
  content: string
  source?: string
}
type LibraryAsset = (AssetDocument & { kind?: 'media' }) | TextLibraryAsset

const assetTypeOptions: Array<{ value: AssetTypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
  { value: 'text', label: 'Text / Prompts' },
  { value: 'other', label: 'Other' },
]

const emptyCounts: AssetCounts = {
  all: 0,
  image: 0,
  video: 0,
  audio: 0,
  document: 0,
  text: 0,
  other: 0,
}

const sortOptions: Array<{ value: AssetSort; label: string }> = [
  { value: 'date-desc', label: 'Date added · newest first' },
  { value: 'date-asc', label: 'Date added · oldest first' },
  { value: 'name-asc', label: 'Name · A to Z' },
  { value: 'name-desc', label: 'Name · Z to A' },
  { value: 'size-desc', label: 'Size · largest first' },
  { value: 'size-asc', label: 'Size · smallest first' },
  { value: 'type-asc', label: 'File type' },
]

const viewOptions: Array<{ value: AssetView; label: string; Icon: typeof List }> = [
  { value: 'list', label: 'List', Icon: List },
  { value: 'icon', label: 'Icon', Icon: Grid2X2 },
  { value: 'medium-icon', label: 'Medium icon', Icon: LayoutGrid },
]

function mediaSource(asset: AssetDocument) {
  const source = asset.url || ''
  if (!source) return ''
  if (source.startsWith('blob:') || source.startsWith('data:')) return source

  if (source) {
    try {
      const parsed = new URL(source, 'http://payload.local')
      if (parsed.pathname.startsWith('/api/media/file/')) return ''
      if (parsed.origin !== 'http://payload.local') return source
      if (source.startsWith('/')) return source
    } catch {
      return source
    }
  }

  return source
}

function AssetPreview({ asset, source }: { asset: AssetDocument; source: string }) {
  if (asset.mimeType?.startsWith('image/') && source) {
    return (
      <Image
        src={source}
        alt={asset.filename || ''}
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
        unoptimized
        className="object-cover"
      />
    )
  }
  if (asset.mimeType?.startsWith('video/') && source) {
    return (
      <video src={source} muted playsInline preload="metadata" className="size-full object-cover" />
    )
  }
  if (asset.mimeType?.startsWith('audio/')) return <FileAudio className="text-zinc-400" />
  if (asset.mimeType === 'application/pdf') return <FileText className="text-zinc-400" />
  return <FileVideo className="text-zinc-300" />
}

function AssetSelectionButton({
  asset,
  selectionId,
  selected,
  onToggle,
}: {
  asset: AssetDocument
  selectionId?: string
  selected: boolean
  onToggle: (assetId: string) => void
}) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      aria-label={`${t(selected ? 'Deselect' : 'Select')} ${asset.filename || t('asset')}`}
      aria-pressed={selected}
      onClick={() => onToggle(selectionId || asset.id)}
      className={`absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-md border shadow-sm transition ${selected ? 'border-violet-600 bg-violet-600 text-white opacity-100' : 'border-zinc-300 bg-white/95 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
    >
      {selected && <Check size={14} strokeWidth={2.8} />}
    </button>
  )
}

function AssetCard({
  asset,
  view,
  selected,
  onToggle,
}: {
  asset: AssetDocument
  view: AssetView
  selected: boolean
  onToggle: (assetId: string) => void
}) {
  const { locale, t } = useLocale()
  const source = mediaSource(asset)
  if (view === 'list') {
    return (
      <article
        className={`group relative flex min-w-0 items-center rounded-xl border bg-white transition ${selected ? 'border-violet-300 bg-violet-50/40' : 'border-zinc-200 hover:bg-zinc-50'}`}
      >
        <a
          href={source || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-xl p-2 pr-12"
        >
          <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-100">
            <AssetPreview asset={asset} source={source} />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-800">
              {asset.filename || t('Untitled asset')}
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-500">
              {asset.mimeType || t('Unknown type')} ·{' '}
              {formatLocaleBytes(asset.filesize || 0, locale)}
            </span>
          </span>
          <span className="hidden shrink-0 pr-8 text-xs text-zinc-400 md:block">
            {formatLocaleDate(asset.createdAt, locale)}
          </span>
        </a>
        <AssetSelectionButton
          asset={asset}
          selectionId={`media:${asset.id}`}
          selected={selected}
          onToggle={onToggle}
        />
      </article>
    )
  }

  return (
    <article
      className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-violet-400 ring-2 ring-violet-100' : 'border-zinc-200'}`}
    >
      <a href={source || undefined} target="_blank" rel="noreferrer" className="block">
        <div
          className={`relative grid place-items-center overflow-hidden bg-zinc-100 ${view === 'icon' ? 'aspect-square' : 'aspect-[4/3]'}`}
        >
          <AssetPreview asset={asset} source={source} />
        </div>
        <div className={view === 'icon' ? 'px-2.5 py-2' : 'p-3'}>
          <p
            className={`truncate font-medium text-zinc-800 ${view === 'icon' ? 'text-xs' : 'text-sm'}`}
          >
            {asset.filename || t('Untitled asset')}
          </p>
          {view === 'medium-icon' && (
            <p className="mt-1 truncate text-xs text-zinc-500">
              {asset.mimeType} · {formatLocaleBytes(asset.filesize || 0, locale)}
            </p>
          )}
        </div>
      </a>
      <AssetSelectionButton
        asset={asset}
        selectionId={`media:${asset.id}`}
        selected={selected}
        onToggle={onToggle}
      />
    </article>
  )
}

function TextAssetCard({
  asset,
  view,
  selected,
  onToggle,
  onSaved,
}: {
  asset: TextLibraryAsset
  view: AssetView
  selected: boolean
  onToggle: (assetId: string) => void
  onSaved: () => void
}) {
  const { locale, t } = useLocale()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(asset.title)
  const [content, setContent] = useState(asset.content)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asset.content)
      setMessage(t('Copied text.'))
    } catch {
      setMessage(t('Clipboard access is unavailable.'))
    }
  }
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await studioFetch('/api/studio/text-assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asset.id, title, content }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not update text asset.')
      setEditing(false)
      onSaved()
      setMessage(t('Saved.'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update text asset.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm ${selected ? 'border-violet-400 ring-2 ring-violet-100' : 'border-zinc-200'}`}
    >
      <AssetSelectionButton
        asset={asset}
        selectionId={`text:${asset.id}`}
        selected={selected}
        onToggle={onToggle}
      />
      <div className="pr-8">
        <p className="truncate text-sm font-semibold text-zinc-800">{asset.title}</p>
        <p className="mt-1 text-[11px] text-zinc-400">
          {t('Text asset')} · {formatLocaleBytes(asset.filesize || 0, locale)} ·{' '}
          {formatLocaleDate(asset.createdAt, locale)}
        </p>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label={t('Text asset title')}
            className="h-9 w-full rounded-lg border border-zinc-200 px-2.5 text-xs outline-none focus:border-violet-400"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            aria-label={t('Text asset content')}
            rows={view === 'list' ? 4 : 7}
            className="w-full resize-y rounded-lg border border-zinc-200 p-2.5 text-xs leading-5 outline-none focus:border-violet-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || !title.trim() || !content.trim()}
              onClick={() => void save()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Save size={13} /> {t('Save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setTitle(asset.title)
                setContent(asset.content)
              }}
              className="h-8 rounded-lg px-2.5 text-xs text-zinc-500 hover:bg-zinc-100"
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p
          className={`mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-600 ${view === 'list' ? 'line-clamp-3' : 'line-clamp-6'}`}
        >
          {asset.content}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <Copy size={13} /> Copy
        </button>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <Pencil size={13} /> {editing ? 'Close editor' : 'Edit'}
        </button>
        {message && (
          <span role="status" className="text-[11px] text-zinc-500">
            {message}
          </span>
        )}
      </div>
    </article>
  )
}

export function AssetLibrary() {
  const { locale, t } = useLocale()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [counts, setCounts] = useState<AssetCounts>(emptyCounts)
  const [quota, setQuota] = useState<AssetQuota>({ usedBytes: 0, limitBytes: 0 })
  const [totalDocs, setTotalDocs] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>('all')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<AssetView>('medium-icon')
  const [sort, setSort] = useState<AssetSort>('date-desc')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [openMenu, setOpenMenu] = useState<MenuName>(null)
  const [newTextOpen, setNewTextOpen] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [savingText, setSavingText] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const visibleAssets = assets

  const load = useCallback(async () => {
    setError('')
    try {
      const query = new URLSearchParams({ page: String(page), limit: '40', sort })
      if (search) query.set('search', search)
      if (typeFilter !== 'all') query.set('type', typeFilter)
      const response = await studioFetch(`/api/studio/assets?${query}`)
      const responseBody = await response.json()
      if (response.ok && Array.isArray(responseBody.docs)) {
        setAssets(responseBody.docs)
        setCounts({ ...emptyCounts, ...responseBody.counts })
        setQuota(responseBody.quota || { usedBytes: 0, limitBytes: 0 })
        setTotalDocs(responseBody.totalDocs || 0)
        setTotalPages(Math.max(1, responseBody.totalPages || 1))
      } else {
        setError(t(responseBody.error || 'Could not load assets.'))
      }
    } catch {
      setError('Could not load assets.')
    } finally {
      setLoading(false)
    }
  }, [page, search, sort, t, typeFilter])

  useEffect(() => {
    // The request resolves asynchronously and then initializes the remote asset state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSearch(searchDraft.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const upload = async (files: File[]) => {
    if (!files.length || uploadProgress) return
    setError('')
    setNotice('')
    const failures: string[] = []
    let uploadedCount = 0

    for (const [index, file] of files.entries()) {
      setUploadProgress({ completed: index + 1, total: files.length })
      try {
        const form = new FormData()
        form.set('file', file)
        form.set('alt', file.name)
        const response = await studioFetch('/api/studio/assets', { method: 'POST', body: form })
        const responseBody = await response.json()
        if (!response.ok) failures.push(`${file.name}: ${responseBody.error || 'Upload failed.'}`)
        else uploadedCount += 1
      } catch {
        failures.push(`${file.name}: Upload failed.`)
      }
    }

    setUploadProgress(null)
    if (failures.length) {
      setError(
        `Uploaded ${uploadedCount} of ${files.length} files. ${failures.slice(0, 3).join(' ')}${failures.length > 3 ? ` And ${failures.length - 3} more failed.` : ''}`,
      )
    }
    if (uploadedCount) {
      setLoading(true)
      await load()
    }
  }

  const deleteSelected = async () => {
    if (!selectedIds.length || deleting) return
    const selectedCount = selectedIds.length
    const confirmed = window.confirm(
      `Delete ${selectedCount} selected asset${selectedCount === 1 ? '' : 's'}? Workflow nodes using these files will be reset.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const mediaIds = selectedIds
        .filter((id) => id.startsWith('media:'))
        .map((id) => id.slice('media:'.length))
      const textIds = selectedIds
        .filter((id) => id.startsWith('text:'))
        .map((id) => id.slice('text:'.length))
      if (mediaIds.length) {
        const response = await studioFetch('/api/studio/assets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: mediaIds }),
        })
        const responseBody = await response.json()
        if (!response.ok) {
          setError(responseBody.error || 'Could not delete the selected assets.')
          return
        }
      }
      for (const id of textIds) {
        const response = await studioFetch('/api/studio/text-assets', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        const responseBody = await response.json()
        if (!response.ok)
          throw new Error(responseBody.error || 'Could not delete a selected text asset.')
      }
      const deletedKeys = new Set(selectedIds)
      setAssets((current) =>
        current.filter(
          (asset) => !deletedKeys.has(`${asset.kind === 'text' ? 'text' : 'media'}:${asset.id}`),
        ),
      )
      setSelectedIds([])
      setNotice(
        `Deleted ${selectedCount} asset${selectedCount === 1 ? '' : 's'}. Workflow nodes using media files were reset.`,
      )
      setLoading(true)
      await load()
    } catch {
      setError('Could not delete the selected assets.')
      setSelectedIds([])
      setLoading(true)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelection = (assetId: string) =>
    setSelectedIds((current) => toggleAssetSelection(current, assetId))

  const createTextAsset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingText || !textTitle.trim() || !textContent.trim()) return
    setSavingText(true)
    setError('')
    try {
      const response = await studioFetch('/api/studio/text-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: textTitle, content: textContent }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Text asset could not be saved.')
      setTextTitle('')
      setTextContent('')
      setNewTextOpen(false)
      setTypeFilter('text')
      setPage(1)
      setLoading(true)
      setNotice('Text asset saved.')
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Text asset could not be saved.',
      )
    } finally {
      setSavingText(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f7f8] lg:flex-row">
      <Sidebar active="assets" />
      <section className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-10 lg:py-8">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                Workspace
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.035em]">Asset library</h1>
              <p className="mt-1.5 text-sm text-zinc-500">
                Upload and reuse production media across workflows.
              </p>
            </div>
            <input
              ref={input}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                if (files.length) void upload(files)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => setNewTextOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <FileText size={15} /> {t('New text asset')}
            </button>
            <button
              type="button"
              disabled={Boolean(uploadProgress)}
              onClick={() => input.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
            >
              {uploadProgress ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {uploadProgress
                ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
                : t('Upload assets')}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="relative min-w-[240px] flex-1 sm:max-w-md">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder={t('Search by filename, title, or alt text')}
                  aria-label={t('Search assets')}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-9 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
                {searchDraft && (
                  <button
                    type="button"
                    aria-label={t('Clear asset search')}
                    onClick={() => setSearchDraft('')}
                    className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <div className="min-w-52 flex-1 sm:max-w-xs">
                <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                  <span>{t('Storage used')}</span>
                  <span>
                    {formatLocaleBytes(quota.usedBytes, locale)} /{' '}
                    {formatLocaleBytes(quota.limitBytes, locale)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('Asset storage quota')}
                  aria-valuemin={0}
                  aria-valuemax={quota.limitBytes}
                  aria-valuenow={quota.usedBytes}
                  className="h-1.5 overflow-hidden rounded-full bg-zinc-100"
                >
                  <div
                    className="h-full rounded-full bg-violet-600 transition-[width]"
                    style={{
                      width: `${quota.limitBytes ? Math.min(100, (quota.usedBytes / quota.limitBytes) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="group"
              aria-label={t('Filter assets by type')}
            >
              {assetTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={typeFilter === option.value}
                  onClick={() => {
                    setPage(1)
                    setTypeFilter(option.value)
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${typeFilter === option.value ? 'bg-violet-100 text-violet-800' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                  {t(option.label)}
                  <span
                    className={typeFilter === option.value ? 'text-violet-500' : 'text-zinc-400'}
                  >
                    {counts[option.value]}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-2">
            <div className="flex items-center gap-2 pl-1 text-xs text-zinc-500">
              <span>
                {selectedIds.length
                  ? `${selectedIds.length} ${t('selected')}`
                  : `${totalDocs} ${t('assets')}`}
              </span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-md px-1.5 py-1 font-medium text-violet-700 hover:bg-violet-50"
                >
                  {t('Clear selection')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!selectedIds.length || deleting}
                onClick={() => void deleteSelected()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-zinc-300"
              >
                {deleting ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {t('Delete')}
                {selectedIds.length ? ` (${selectedIds.length})` : ''}
              </button>

              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'sort'}
                  onClick={() => setOpenMenu((current) => (current === 'sort' ? null : 'sort'))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <ArrowDownUp size={14} /> {t('Sort')} <ChevronDown size={13} />
                </button>
                {openMenu === 'sort' && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
                  >
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === option.value}
                        onClick={() => {
                          setSort(option.value)
                          setOpenMenu(null)
                        }}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-xs ${sort === option.value ? 'bg-violet-50 font-medium text-violet-700' : 'text-zinc-700 hover:bg-zinc-50'}`}
                      >
                        {t(option.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'view'}
                  onClick={() => setOpenMenu((current) => (current === 'view' ? null : 'view'))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <LayoutGrid size={14} /> {t('View')} <ChevronDown size={13} />
                </button>
                {openMenu === 'view' && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
                  >
                    {viewOptions.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={view === value}
                        onClick={() => {
                          setView(value)
                          setOpenMenu(null)
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${view === value ? 'bg-violet-50 font-medium text-violet-700' : 'text-zinc-700 hover:bg-zinc-50'}`}
                      >
                        <Icon size={14} /> {t(label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid h-72 place-items-center text-sm text-zinc-500">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : visibleAssets.length ? (
            <div
              className={
                view === 'list'
                  ? 'flex flex-col gap-2'
                  : view === 'icon'
                    ? 'grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8'
                    : 'grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5'
              }
            >
              {visibleAssets.map((asset) =>
                asset.kind === 'text' ? (
                  <TextAssetCard
                    key={`text:${asset.id}`}
                    asset={asset}
                    view={view}
                    selected={selectedIds.includes(`text:${asset.id}`)}
                    onToggle={toggleSelection}
                    onSaved={() => void load()}
                  />
                ) : (
                  <AssetCard
                    key={`media:${asset.id}`}
                    asset={asset}
                    view={view}
                    selected={selectedIds.includes(`media:${asset.id}`)}
                    onToggle={toggleSelection}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white text-center">
              <div>
                <ImageIcon className="mx-auto text-zinc-300" />
                <p className="mt-3 text-sm font-medium">{t('No assets yet')}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {t('Upload media or create a text asset to save reusable content.')}
                </p>
              </div>
            </div>
          )}
          {!loading && totalPages > 1 && (
            <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Asset pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('Previous')}
              </button>
              <span className="text-xs tabular-nums text-zinc-500">
                {t('Page {page} of {totalPages}', { page, totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('Next')}
              </button>
            </nav>
          )}
        </div>
      </section>
      {newTextOpen && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/35 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewTextOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-text-asset-title"
            className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  {t('Text / Prompt')}
                </p>
                <h2 id="new-text-asset-title" className="mt-1 text-lg font-semibold text-zinc-900">
                  {t('New text asset')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setNewTextOpen(false)}
                aria-label={t('Close')}
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
              >
                <X size={15} />
              </button>
            </div>
            <form onSubmit={(event) => void createTextAsset(event)} className="mt-5 space-y-3">
              <label className="block text-xs font-medium text-zinc-600">
                {t('Title')}
                <input
                  required
                  value={textTitle}
                  onChange={(event) => setTextTitle(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400"
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                {t('Content')}
                <textarea
                  required
                  value={textContent}
                  onChange={(event) => setTextContent(event.target.value)}
                  rows={10}
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 p-3 text-sm leading-6 outline-none focus:border-violet-400"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNewTextOpen(false)}
                  className="h-9 rounded-lg px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingText || !textTitle.trim() || !textContent.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingText && <LoaderCircle size={13} className="animate-spin" />}
                  {t('Save text asset')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

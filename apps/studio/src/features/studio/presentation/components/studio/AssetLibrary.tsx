'use client'

import {
  ArrowDownUp,
  Check,
  ChevronDown,
  FileAudio,
  FileText,
  FileVideo,
  Grid2X2,
  Image as ImageIcon,
  LayoutGrid,
  List,
  LoaderCircle,
  Trash2,
  Upload,
} from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssetDocument } from '@znith/contracts'
import { formatFileSize } from '@znith/utils'
import { Brand, Sidebar } from './AppChrome'
import { sortAssets, toggleAssetSelection } from './asset-library-utils'
import type { AssetSort } from './asset-library-utils'

type AssetView = 'list' | 'icon' | 'medium-icon'
type MenuName = 'sort' | 'view' | null

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
  if (source) {
    try {
      const parsed = new URL(source, 'http://payload.local')
      if (parsed.pathname.startsWith('/api/media/file/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      // Fall back to the saved filename if Payload returns a malformed URL.
    }
  }

  return asset.filename ? `/api/media/file/${encodeURIComponent(asset.filename)}` : source
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
  selected,
  onToggle,
}: {
  asset: AssetDocument
  selected: boolean
  onToggle: (assetId: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={`${selected ? 'Deselect' : 'Select'} ${asset.filename || 'asset'}`}
      aria-pressed={selected}
      onClick={() => onToggle(asset.id)}
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
              {asset.filename || 'Untitled asset'}
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-500">
              {asset.mimeType || 'Unknown type'} · {formatFileSize(asset.filesize)}
            </span>
          </span>
          <span className="hidden shrink-0 pr-8 text-xs text-zinc-400 md:block">
            {new Date(asset.createdAt).toLocaleDateString()}
          </span>
        </a>
        <AssetSelectionButton asset={asset} selected={selected} onToggle={onToggle} />
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
            {asset.filename || 'Untitled asset'}
          </p>
          {view === 'medium-icon' && (
            <p className="mt-1 truncate text-xs text-zinc-500">
              {asset.mimeType} · {formatFileSize(asset.filesize)}
            </p>
          )}
        </div>
      </a>
      <AssetSelectionButton asset={asset} selected={selected} onToggle={onToggle} />
    </article>
  )
}

export function AssetLibrary() {
  const [assets, setAssets] = useState<AssetDocument[]>([])
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
  const input = useRef<HTMLInputElement>(null)
  const visibleAssets = useMemo(() => sortAssets(assets, sort), [assets, sort])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/studio/assets')
      const responseBody = await response.json()
      if (response.ok && Array.isArray(responseBody.docs)) {
        setAssets(responseBody.docs)
        setSelectedIds((selected) =>
          selected.filter((id) =>
            responseBody.docs.some((asset: AssetDocument) => asset.id === id),
          ),
        )
      } else {
        setError(responseBody.error || 'Could not load assets.')
      }
    } catch {
      setError('Could not load assets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // The request resolves asynchronously and then initializes the remote asset state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

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
        const response = await fetch('/api/studio/assets', { method: 'POST', body: form })
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
      const response = await fetch('/api/studio/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const responseBody = await response.json()
      if (!response.ok) {
        setError(responseBody.error || 'Could not delete the selected assets.')
        return
      }
      const deletedIds = new Set<string>(responseBody.deletedIds)
      setAssets((current) => current.filter((asset) => !deletedIds.has(asset.id)))
      setSelectedIds([])
      setNotice(
        `Deleted ${responseBody.count} asset${responseBody.count === 1 ? '' : 's'}. Workflow nodes using them were reset.`,
      )
    } catch {
      setError('Could not delete the selected assets.')
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelection = (assetId: string) =>
    setSelectedIds((current) => toggleAssetSelection(current, assetId))

  return (
    <main className="flex min-h-screen bg-[#f7f7f8]">
      <Sidebar active="assets" />
      <section className="min-w-0 flex-1">
        <header className="flex h-14 items-center border-b border-zinc-200 bg-white px-5 lg:hidden">
          <Brand />
        </header>
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
                : 'Upload assets'}
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

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-2">
            <div className="flex items-center gap-2 pl-1 text-xs text-zinc-500">
              <span>
                {selectedIds.length ? `${selectedIds.length} selected` : `${assets.length} assets`}
              </span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-md px-1.5 py-1 font-medium text-violet-700 hover:bg-violet-50"
                >
                  Clear selection
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
                Delete{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </button>

              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'sort'}
                  onClick={() => setOpenMenu((current) => (current === 'sort' ? null : 'sort'))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <ArrowDownUp size={14} /> Sort <ChevronDown size={13} />
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
                        {option.label}
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
                  <LayoutGrid size={14} /> View <ChevronDown size={13} />
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
                        <Icon size={14} /> {label}
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
              {visibleAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  view={view}
                  selected={selectedIds.includes(asset.id)}
                  onToggle={toggleSelection}
                />
              ))}
            </div>
          ) : (
            <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white text-center">
              <div>
                <ImageIcon className="mx-auto text-zinc-300" />
                <p className="mt-3 text-sm font-medium">No assets yet</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Upload an image, video, audio file, or PDF.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

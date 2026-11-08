'use client'

import { useEffect, useState } from 'react'
import {
  BookOpenText,
  Boxes,
  CircleAlert,
  FileAudio,
  FileImage,
  FileText,
  LoaderCircle,
  PanelLeftClose,
  Search,
  Video,
} from 'lucide-react'
import { formatLocaleBytes, useLocale } from '../../../shared/i18n/LocaleProvider'

type WorkflowAsset = {
  id: string
  kind?: 'media' | 'text'
  title?: string
  content?: string
  filename?: string
  alt?: string
  mimeType?: string
  filesize?: number
  url?: string | null
}

type WorkflowPrompt = {
  id: string
  title: string
  content: string
  category?: string
}
type CanvasListNode = { id: string; name: string; type: string; groupId?: string }
type CanvasListGroup = { id: string; name: string; nodeIds: string[] }

type PanelTab = 'elements' | 'assets' | 'prompts'
type AssetFilter = 'all' | 'image' | 'video' | 'audio' | 'document' | 'text' | 'other'

const filters: Array<{ id: AssetFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'PDF' },
  { id: 'text', label: 'Text' },
  { id: 'other', label: 'Other' },
]

function AssetIcon({ asset }: { asset: WorkflowAsset }) {
  if (asset.kind === 'text' || asset.mimeType?.startsWith('text/')) return <FileText size={17} />
  if (asset.mimeType?.startsWith('video/')) return <Video size={17} />
  if (asset.mimeType?.startsWith('audio/')) return <FileAudio size={17} />
  if (asset.mimeType?.startsWith('image/')) return <FileImage size={17} />
  return <Boxes size={17} />
}

export function WorkflowSidePanel({
  width,
  onClose,
  searchNodes,
  onSearchNodes,
  onInsertAsset,
  onInsertPrompt,
  canvasNodes,
  canvasGroups,
  onFocusNode,
}: {
  width: number
  onClose: () => void
  searchNodes: string
  onSearchNodes: (value: string) => void
  onInsertAsset: (asset: WorkflowAsset) => void
  onInsertPrompt: (prompt: WorkflowPrompt) => void
  canvasNodes: CanvasListNode[]
  canvasGroups: CanvasListGroup[]
  onFocusNode: (nodeId: string) => void
}) {
  const { locale, t } = useLocale()
  const [tab, setTab] = useState<PanelTab>('elements')
  const [search, setSearch] = useState('')
  const [assetType, setAssetType] = useState<AssetFilter>('all')
  const [assets, setAssets] = useState<WorkflowAsset[]>([])
  const [prompts, setPrompts] = useState<WorkflowPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (tab !== 'assets') return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ page: '1', limit: '40', type: assetType })
      if (search.trim()) query.set('search', search.trim())
      setLoading(true)
      setError('')
      void fetch(`/api/studio/assets?${query}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { docs?: WorkflowAsset[]; error?: string }
          if (!response.ok) throw new Error(body.error || 'Assets could not be loaded.')
          setAssets(body.docs || [])
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError(failure instanceof Error ? failure.message : 'Assets could not be loaded.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [assetType, reloadKey, search, tab])

  useEffect(() => {
    if (tab !== 'prompts') return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ page: '1' })
      if (search.trim()) query.set('search', search.trim())
      setLoading(true)
      setError('')
      void fetch(`/api/studio/prompts?${query}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { docs?: WorkflowPrompt[]; error?: string }
          if (!response.ok) throw new Error(body.error || 'Prompts could not be loaded.')
          setPrompts(body.docs || [])
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError(failure instanceof Error ? failure.message : 'Prompts could not be loaded.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [reloadKey, search, tab])

  const filteredCanvasNodes = canvasNodes.filter((node) =>
    `${node.name} ${node.type}`.toLowerCase().includes(searchNodes.toLowerCase()),
  )
  const matchingNodeIds = new Set(filteredCanvasNodes.map((node) => node.id))

  const tabs: Array<{ id: PanelTab; label: string; Icon: typeof Boxes }> = [
    { id: 'elements', label: t('Nodes'), Icon: Boxes },
    { id: 'assets', label: t('Assets'), Icon: FileImage },
    { id: 'prompts', label: t('Prompts'), Icon: BookOpenText },
  ]

  return (
    <aside
      aria-label={t('Workflow panel')}
      className="absolute bottom-20 left-2 top-16 z-40 flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl lg:relative lg:bottom-auto lg:left-auto lg:top-auto lg:z-10 lg:max-w-none lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r lg:shadow-none"
      style={{ width: `${width}px` }}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          {t('Workflow panel')}
        </span>
        <button
          type="button"
          aria-label={t('Close workflow side panel')}
          title={t('Close side panel')}
          onClick={onClose}
          className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-violet-600"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 border-b border-zinc-100 p-1.5">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id)
              setSearch('')
            }}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-violet-600 ${tab === id ? 'bg-violet-50 text-violet-800' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="relative border-b border-zinc-100 p-3">
        <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          aria-label={
            tab === 'elements'
              ? t('Search canvas elements')
              : tab === 'assets'
                ? t('Search assets')
                : t('Search prompts')
          }
          value={tab === 'elements' ? searchNodes : search}
          onChange={(event) =>
            tab === 'elements' ? onSearchNodes(event.target.value) : setSearch(event.target.value)
          }
          placeholder={
            tab === 'elements'
              ? t('Find a node')
              : tab === 'assets'
                ? t('Search assets…')
                : t('Search prompts…')
          }
          className="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-xs outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-50"
        />
      </div>

      {tab === 'assets' && (
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2 [scrollbar-width:none]">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={assetType === filter.id}
              onClick={() => setAssetType(filter.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${assetType === filter.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:text-zinc-800'}`}
            >
              {t(filter.label)}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'elements' && (
          <div className="space-y-5">
            <section>
              <h2 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {t('On canvas')} · {canvasNodes.length}
              </h2>
              {canvasGroups
                .filter(
                  (group) =>
                    group.name.toLowerCase().includes(searchNodes.toLowerCase()) ||
                    group.nodeIds.some((nodeId) => matchingNodeIds.has(nodeId)),
                )
                .map((group) => (
                  <details key={group.id} className="group mb-1 rounded-xl border border-zinc-100">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                      <Boxes size={13} className="text-violet-500" />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="text-[9px] font-normal text-zinc-400">
                        {group.nodeIds.length}
                      </span>
                    </summary>
                    <button
                      type="button"
                      onClick={() => onFocusNode(`__zenith-group-${group.id}`)}
                      className="mx-2 mb-1 flex h-7 items-center rounded-lg px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                    >
                      {t('Focus group')}
                    </button>
                    <div className="space-y-0.5 px-1 pb-1">
                      {group.nodeIds.map((nodeId) => {
                        const node = canvasNodes.find((item) => item.id === nodeId)
                        if (
                          !node ||
                          !`${node.name} ${node.type}`
                            .toLowerCase()
                            .includes(searchNodes.toLowerCase())
                        )
                          return null
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => onFocusNode(node.id)}
                            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10px] text-zinc-600 hover:bg-zinc-50"
                          >
                            <span className="min-w-0 flex-1 truncate">{node.name}</span>
                            <span className="truncate text-[9px] text-zinc-400">{node.type}</span>
                          </button>
                        )
                      })}
                    </div>
                  </details>
                ))}
              <div className="space-y-0.5">
                {filteredCanvasNodes
                  .filter((node) => !node.groupId)
                  .map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onFocusNode(node.id)}
                      className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10px] text-zinc-600 hover:bg-zinc-50"
                    >
                      <span className="min-w-0 flex-1 truncate">{node.name}</span>
                      <span className="truncate text-[9px] text-zinc-400">{node.type}</span>
                    </button>
                  ))}
              </div>
              {!filteredCanvasNodes.length && (
                <EmptyPanel>
                  {canvasNodes.length ? t('No matching nodes.') : t('No nodes on this canvas.')}
                </EmptyPanel>
              )}
            </section>
          </div>
        )}
        {tab === 'assets' && (
          <div className="space-y-2">
            {loading ? (
              <PanelLoading />
            ) : error ? (
              <PanelError message={error} onRetry={() => setReloadKey((value) => value + 1)} />
            ) : (
              assets.map((asset) => (
                <button
                  key={`${asset.kind || 'media'}:${asset.id}`}
                  type="button"
                  onClick={() => onInsertAsset(asset)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-100 p-2 text-left transition hover:border-violet-200 hover:bg-violet-50/40 focus-visible:outline-2 focus-visible:outline-violet-600"
                >
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-500">
                    {asset.kind === 'text' ? <FileText size={17} /> : <AssetIcon asset={asset} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-zinc-700">
                      {asset.title || asset.filename || asset.alt || t('Untitled asset')}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-400">
                      {asset.kind === 'text'
                        ? t('Text asset')
                        : `${asset.mimeType || t('Unknown type')} · ${formatLocaleBytes(asset.filesize || 0, locale)}`}
                    </span>
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-600">
                    {t('Insert')}
                  </span>
                </button>
              ))
            )}
            {!loading && !error && !assets.length && (
              <EmptyPanel>{t('No matching assets.')}</EmptyPanel>
            )}
          </div>
        )}
        {tab === 'prompts' && (
          <div className="space-y-2">
            {loading ? (
              <PanelLoading />
            ) : error ? (
              <PanelError message={error} onRetry={() => setReloadKey((value) => value + 1)} />
            ) : (
              prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => onInsertPrompt(prompt)}
                  className="w-full rounded-xl border border-zinc-100 p-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40 focus-visible:outline-2 focus-visible:outline-violet-600"
                >
                  <span className="block truncate text-[11px] font-semibold text-zinc-800">
                    {prompt.title}
                  </span>
                  <span className="mt-1 block line-clamp-3 whitespace-pre-wrap text-[10px] leading-4 text-zinc-500">
                    {prompt.content}
                  </span>
                  {prompt.category && (
                    <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] text-zinc-500">
                      {prompt.category}
                    </span>
                  )}
                </button>
              ))
            )}
            {!loading && !error && !prompts.length && (
              <EmptyPanel>{t('No saved prompts match this search.')}</EmptyPanel>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400">
        {tab === 'elements'
          ? `${canvasNodes.length} ${t('nodes')}`
          : tab === 'assets'
            ? `${assets.length} ${t('assets')}`
            : `${prompts.length} ${t('prompts')}`}
      </div>
    </aside>
  )
}

function EmptyPanel({ children }: { children: string }) {
  return (
    <p className="rounded-xl bg-zinc-50 px-3 py-7 text-center text-xs text-zinc-500">{children}</p>
  )
}

function PanelLoading() {
  const { t } = useLocale()
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
      <LoaderCircle size={14} className="animate-spin" />
      {t('Loading')}
    </div>
  )
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLocale()
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
      <CircleAlert size={14} className="mb-2" />
      {t(message)}
      <button type="button" onClick={onRetry} className="mt-2 block font-semibold underline">
        {t('Retry')}
      </button>
    </div>
  )
}

'use client'

import {
  Clapperboard,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { studioFetch } from '@/lib/studio-local-api'
import {
  normalizeProductionSheet,
  productionProjectInfo,
  productionSheetNames,
  productionSourceHash,
  validateProductionSheets,
} from '@/lib/production-sheet'
import type {
  ProductionRecord,
  ProductionSheet,
  ProductionSheetName,
  ProductionSheets,
} from '@/lib/production-sheet'
import { formatLocaleDate, useLocale } from '@/features/studio/shared/i18n/LocaleProvider'
import { Sidebar } from './AppChrome'

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

function productionTitle(production: ProductionRecord) {
  return production.title || production.projectCode || 'Production project'
}

export function ProductionDashboard() {
  const { locale, t } = useLocale()
  const router = useRouter()
  const [productions, setProductions] = useState<ProductionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [draft, setDraft] = useState<ProductionRecord | null>(null)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadProductions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await studioFetch('/api/studio/productions', { cache: 'no-store' })
      const body = (await response.json()) as { docs?: ProductionRecord[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load production projects.')
      setProductions((body.docs || []).map(normalizeStoredProduction))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load production projects.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProductions()
  }, [loadProductions])

  const displayedProductions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return productions.filter((production) =>
      `${production.title} ${production.projectCode}`.toLocaleLowerCase().includes(query),
    )
  }, [productions, search])

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
      const old = productions.find((item) => item.id === id)
      const now = new Date().toISOString()
      const info = productionProjectInfo(body.sheets, id)
      setDraft({
        id,
        spreadsheetUrl: sourceUrl.trim(),
        title: old?.title || info.title,
        projectCode: old?.projectCode || info.projectCode,
        sheets: body.sheets,
        sourceHash: productionSourceHash(body.sheets),
        validation: validateProductionSheets(body.sheets),
        outputs: old?.outputs || {},
        importedAt: now,
        createdAt: old?.createdAt || now,
        updatedAt: now,
      })
      setFeedback(
        `${productionSheetNames.length} sheets · ${body.sheets['Shot Master'].rows.length} shots`,
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Google Sheets could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  const saveDraftAndOpen = async () => {
    if (!draft || saving) return
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const response = await studioFetch('/api/studio/productions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const body = (await response.json()) as { production?: ProductionRecord; error?: string }
      if (!response.ok || !body.production)
        throw new Error(body.error || 'Could not save production data.')
      setProductions((current) => [
        normalizeStoredProduction(body.production!),
        ...current.filter((item) => item.id !== body.production!.id),
      ])
      router.push(`/production/${encodeURIComponent(body.production.id)}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save production data.')
    } finally {
      setSaving(false)
    }
  }

  const discardDraft = () => {
    setDraft(null)
    setSourceUrl('')
    setFeedback('')
    setError('')
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f7f8] text-zinc-950 lg:flex-row">
      <Sidebar active="production" />
      <section className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                <Clapperboard size={14} /> {t('Workspace')}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">
                {t('production.managerTitle')}
              </h1>
              <p className="mt-2 text-sm text-zinc-500">{t('production.managerSubtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (draft && !window.confirm(t('production.discardUnsaved'))) return
                setCreateOpen((current) => !current)
                setDraft(null)
                setError('')
                setFeedback('')
              }}
              className="inline-flex h-10 items-center gap-2 self-start rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 sm:self-auto"
            >
              {createOpen ? <X size={16} /> : <Plus size={16} />}
              {createOpen ? t('common.cancel') : t('production.create')}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}
          {feedback && !error && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              {feedback}
            </div>
          )}

          {createOpen && (
            <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              {draft ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {t('production.draftReady')}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-semibold text-zinc-950">
                      {productionTitle(draft)}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {draft.projectCode} · {draft.sheets['Shot Master'].rows.length}{' '}
                      {t('production.shots')} ·{' '}
                      {draft.validation.filter((issue) => issue.severity === 'error').length}{' '}
                      {t('production.errors')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={discardDraft}
                      disabled={saving}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveDraftAndOpen()}
                      disabled={saving}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
                    >
                      {saving ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      {saving ? t('production.saving') : t('production.saveOpen')}
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={importSheet}
                  className="flex flex-col gap-3 lg:flex-row lg:items-end"
                >
                  <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-700">
                    {t('production.source')}
                    <input
                      type="url"
                      required
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={importing}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#272441] px-4 text-sm font-semibold text-white transition hover:bg-[#37325e] disabled:cursor-wait disabled:opacity-60"
                  >
                    {importing ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    {importing ? t('production.importing') : t('production.import')}
                  </button>
                  <p className="text-xs text-zinc-500 lg:max-w-[240px]">{t('production.share')}</p>
                </form>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-200/30">
            <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">{t('production.projects')}</h2>
                <p className="mt-1 text-xs text-zinc-500">{t('production.savedHelp')}</p>
              </div>
              <label className="relative w-full max-w-sm">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  size={16}
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('production.search')}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </label>
            </div>

            {loading ? (
              <div className="grid h-64 place-items-center text-sm text-zinc-500">
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="animate-spin" size={18} /> {t('common.loading')}
                </span>
              </div>
            ) : productions.length === 0 ? (
              <div className="grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                    <FileSpreadsheet size={22} />
                  </span>
                  <h2 className="font-semibold">{t('production.emptyTitle')}</h2>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
                    {t('production.emptyHelp')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    {t('production.create')}
                  </button>
                </div>
              </div>
            ) : displayedProductions.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-8 text-sm text-zinc-500">
                {t('production.noSearchResults')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                  <thead className="bg-zinc-50/80 text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="w-[34%] px-5 py-3.5">{t('production.tableProject')}</th>
                      <th className="w-[12%] px-4 py-3.5">{t('production.tableShots')}</th>
                      <th className="w-[20%] px-4 py-3.5">{t('production.tableImported')}</th>
                      <th className="w-[17%] px-4 py-3.5">{t('production.tableOutputs')}</th>
                      <th className="w-[17%] px-4 py-3.5 text-right">
                        {t('production.tableAction')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {displayedProductions.map((production) => {
                      const savedOutputs = Object.values(production.outputs || {}).filter(
                        (output) =>
                          output.status === 'succeeded' &&
                          output.sourceHash === production.sourceHash,
                      ).length
                      return (
                        <tr key={production.id} className="group hover:bg-zinc-50/70">
                          <td className="px-5 py-4">
                            <Link href={`/production/${encodeURIComponent(production.id)}`}>
                              <span className="font-medium text-zinc-900 group-hover:text-violet-700">
                                {productionTitle(production)}
                              </span>
                              <span className="mt-1 block text-xs text-zinc-500">
                                {production.projectCode}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-zinc-600">
                            {production.sheets['Shot Master'].rows.length}
                          </td>
                          <td className="px-4 py-4 text-zinc-500">
                            {formatLocaleDate(production.importedAt, locale)}
                          </td>
                          <td className="px-4 py-4 text-zinc-600">{savedOutputs}</td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/production/${encodeURIComponent(production.id)}`}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                            >
                              {t('production.openProduction')}
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
